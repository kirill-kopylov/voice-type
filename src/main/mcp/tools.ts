// Инструменты MCP-сервера VoiceType: поиск и чтение диктовок и встреч, заметки к встречам.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { MeetingNote, MeetingRecord } from '../../shared/types'
import { store } from '../services/store'
import { extractFrames } from '../services/video-frames'
import { loadEvents, videoPath } from '../services/video-storage'
import { DateInputError, resolveDateRange } from './dates'
import {
  buildDigest, formatClock, getDictationView, getMeetingView, listDictations, listMeetings, screenEventEntries, searchRecords, toNoteView
} from './queries'

const SERVER_INSTRUCTIONS = [
  'VoiceType keeps the user\'s voice dictations and recorded meetings (diarized transcript, summary with decisions, notes).',
  'Date questions ("what happened last week"): start with `digest`, or `list_meetings` with from/to — they return summaries only.',
  'Read a transcript (`get_meeting` with include=["transcript"]) only when the summary is not enough; use from_sec/to_sec/speaker to read a part.',
  'Keywords: `search` (fuzzy by default). Dates everywhere: 2026-10-05, 2026-10, today, yesterday, 7d, 2w.',
  'Meetings with has_video=true have a screen recording: when the transcript refers to something shown on screen, look at it with `get_frames` (a short window around the moment, a few frames).',
  'The transcript of such meetings also contains "[mm:ss] (экран) ..." lines: windows opened/switched, clicks (monitor coordinates), shortcuts, typed and copied text, shapes the user drew. Use their timestamps to pick moments for `get_frames`.',
  'After doing something because of a meeting (created tasks, sent messages) record it with `add_meeting_note` — the user sees these notes in the app.'
].join('\n')

const MAX_FRAMES = 20
const DEFAULT_FRAMES = 8
const DEFAULT_FRAME_WIDTH = 1280
const DEFAULT_WINDOW_SEC = 30
const MAX_FRAME_WINDOW_EVENTS = 60
const MAX_NOTE_CHARS = 5000
const AGENT_AUTHOR = 'agent'

const dateField = (description: string): z.ZodOptional<z.ZodString> => z.string().optional().describe(description)
const FROM = dateField('Start of the period (inclusive). 2026-10-05, 2026-10, today, yesterday, 7d (7 days ago), 2w, or ISO datetime.')
const TO = dateField('End of the period (inclusive; a date without time means the end of that day). Same formats as `from`.')
const LIMIT = z.number().int().min(1).max(100).optional().describe('Max items to return (default 20, max 100).')
const OFFSET = z.number().int().min(0).optional().describe('Items to skip, for paging.')

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

export interface McpToolsHost {
  /** Агент изменил заметки встречи — окно приложения должно обновиться. */
  onNotesChanged: (meetingId: string, notes: MeetingNote[]) => void
}

function notifyNotes(host: McpToolsHost, meeting: MeetingRecord): void {
  host.onNotesChanged(meeting.id, meeting.notes ?? [])
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Ошибки аргументов (например, неверная дата) возвращаем агенту текстом, чтобы он мог исправиться. */
async function guarded(action: () => CallToolResult | Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof DateInputError) return fail(error.message)
    throw error
  }
}

export function createMcpServer(host: McpToolsHost): McpServer {
  const server = new McpServer({ name: 'voice-type', version: '1.0.0' }, { instructions: SERVER_INSTRUCTIONS })

  server.registerTool('search', {
    description:
      'Search all dictations and meetings (summaries, dialog lines, notes). Fuzzy by default (tolerates typos and word forms); '
      + 'several words must all appear in one record. Returns snippets with record ids — open them with get_meeting / get_dictation.',
    inputSchema: {
      query: z.string().min(1).describe('Words to look for.'),
      mode: z.enum(['fuzzy', 'exact']).optional().describe('fuzzy (default) or exact substring match.'),
      types: z.array(z.enum(['dictation', 'meeting_summary', 'meeting_dialog', 'meeting_note'])).optional()
        .describe('Limit to these kinds of records. Default: all.'),
      from: FROM,
      to: TO,
      speaker: z.string().optional().describe('Only dialog lines of this speaker (name substring).'),
      meeting_id: z.string().optional().describe('Search inside one meeting.'),
      sort: z.enum(['relevance', 'newest', 'oldest']).optional().describe('Default: relevance.'),
      limit: LIMIT
    },
    annotations: READ_ONLY
  }, (args) => guarded(() => {
    const hits = searchRecords(store.getHistory(), store.getMeetings(), {
      query: args.query,
      mode: args.mode,
      types: args.types,
      range: resolveDateRange(args.from, args.to),
      speaker: args.speaker,
      meetingId: args.meeting_id,
      sort: args.sort,
      limit: args.limit
    })
    return ok({ count: hits.length, hits })
  }))

  server.registerTool('list_meetings', {
    description:
      'List meetings with date, duration, speakers, summary brief, topics and counters — no transcripts. '
      + 'The cheapest way to see what meetings happened in a period.',
    inputSchema: {
      from: FROM,
      to: TO,
      query: z.string().optional().describe('Words that must appear in the title, summary, topics or decisions.'),
      speaker: z.string().optional().describe('Meetings where this person speaks (name substring).'),
      has_notes: z.boolean().optional().describe('true — only meetings with notes, false — only without.'),
      has_summary: z.boolean().optional(),
      sort: z.enum(['newest', 'oldest', 'longest', 'shortest']).optional().describe('Default: newest.'),
      limit: LIMIT,
      offset: OFFSET
    },
    annotations: READ_ONLY
  }, (args) => guarded(() => ok(listMeetings(store.getMeetings(), {
    range: resolveDateRange(args.from, args.to),
    query: args.query,
    speaker: args.speaker,
    hasNotes: args.has_notes,
    hasSummary: args.has_summary,
    sort: args.sort,
    limit: args.limit,
    offset: args.offset
  }))))

  server.registerTool('get_meeting', {
    description:
      'Read one meeting. By default returns the summary (brief, topics, decisions with assignee/deadline) and notes. '
      + 'Add "transcript" to include the FULL dialog as "[mm:ss] Speaker: text" lines (for meetings with a screen recording, also "[mm:ss] (экран) ..." lines about what happened on screen). By default it is cut at 20000 characters '
      + '(the result then has next_from_sec to continue); pass max_chars=2000000 to get the whole transcript in one call.',
    inputSchema: {
      id: z.string().describe('Meeting id from list_meetings / search / digest.'),
      include: z.array(z.enum(['summary', 'notes', 'transcript'])).optional().describe('Default: ["summary","notes"].'),
      from_sec: z.number().min(0).optional().describe('Transcript: start from this second.'),
      to_sec: z.number().min(0).optional().describe('Transcript: stop at this second.'),
      speaker: z.string().optional().describe('Transcript: only this speaker (name substring).'),
      max_chars: z.number().int().min(500).max(2_000_000).optional().describe('Transcript size limit (default 20000; 2000000 = effectively no limit).'),
      screen_events: z.boolean().optional().describe('Transcript: weave in what happened on screen as "[mm:ss] (экран) ..." lines (default true when the meeting has a screen recording).')
    },
    annotations: READ_ONLY
  }, (args) => {
    const meeting = store.getMeeting(args.id)
    if (!meeting) return fail(`Meeting ${args.id} not found`)
    const wantsEvents = args.screen_events ?? true
    const view = getMeetingView(meeting, {
      include: args.include,
      fromSec: args.from_sec,
      toSec: args.to_sec,
      speaker: args.speaker,
      maxChars: args.max_chars,
      events: wantsEvents && meeting.videoFileName ? loadEvents(meeting.videoFileName) : []
    })
    return ok(view)
  })

  server.registerTool('get_frames', {
    description:
      'Look at the screen recording of a meeting: returns still images (JPEG) taken from the video between from_sec and to_sec. '
      + 'Use it when the transcript is not enough — e.g. someone shows a bug on screen: find the moment in the transcript ([mm:ss] lines), '
      + 'then request frames around it. Frames are evenly spaced; with skip_similar (default) near-identical ones are dropped so you see only changes. '
      + 'Prefer a short window (10-60 s) with 4-10 frames; only meetings with has_video=true have a recording.',
    inputSchema: {
      meeting_id: z.string(),
      from_sec: z.number().min(0).describe('Start of the window, seconds from the start of the meeting.'),
      to_sec: z.number().min(0).optional().describe('End of the window. Default: from_sec + 30.'),
      count: z.number().int().min(1).max(MAX_FRAMES).optional().describe(`How many frames (default ${DEFAULT_FRAMES}, max ${MAX_FRAMES}).`),
      skip_similar: z.boolean().optional().describe('Drop frames that look the same as the previous one (default true). With false you get exactly `count` evenly spaced frames.'),
      max_width: z.number().int().min(320).max(1920).optional().describe(`Frame width in pixels (default ${DEFAULT_FRAME_WIDTH}). Lower it to save tokens.`)
    },
    annotations: READ_ONLY
  }, async (args) => {
    const meeting = store.getMeeting(args.meeting_id)
    if (!meeting) return fail(`Meeting ${args.meeting_id} not found`)
    if (!meeting.videoFileName) return fail('This meeting has no screen recording')

    const durationSec = meeting.durationMs / 1000
    const fromSec = Math.min(args.from_sec, durationSec)
    const toSec = Math.min(args.to_sec ?? fromSec + DEFAULT_WINDOW_SEC, durationSec)
    if (toSec < fromSec) return fail('to_sec must not be less than from_sec')

    const { frames, skippedSimilar } = await extractFrames(videoPath(meeting.videoFileName), {
      fromSec,
      toSec,
      count: args.count ?? DEFAULT_FRAMES,
      skipSimilar: args.skip_similar ?? true,
      maxWidth: args.max_width ?? DEFAULT_FRAME_WIDTH
    })
    if (frames.length === 0) return fail('No frames in this window — the recording may be shorter than the meeting')

    const summary = {
      meeting: meeting.title,
      window: `${formatClock(fromSec)}-${formatClock(toSec)}`,
      frames: frames.map((frame) => formatClock(frame.atSec)),
      skippedSimilar,
      // Что делал пользователь в эти секунды: помогает понять кадры (клики — координаты на мониторе)
      screenEvents: screenEventEntries(loadEvents(meeting.videoFileName), fromSec, toSec).slice(0, MAX_FRAME_WINDOW_EVENTS).map((entry) => entry.text)
    }
    return {
      content: [
        { type: 'text', text: JSON.stringify(summary) },
        ...frames.flatMap((frame): CallToolResult['content'] => [
          { type: 'text', text: `[${formatClock(frame.atSec)}]` },
          { type: 'image', data: frame.jpeg.toString('base64'), mimeType: 'image/jpeg' }
        ])
      ]
    }
  })

  server.registerTool('list_dictations', {
    description:
      'List voice dictations (short texts the user dictated) newest first by default, with a text preview. '
      + 'Use `query` to require words in the text; for fuzzy matching use `search` with types=["dictation"].',
    inputSchema: {
      from: FROM,
      to: TO,
      query: z.string().optional().describe('Words that must all appear in the text.'),
      min_chars: z.number().int().min(1).optional().describe('Skip dictations shorter than this.'),
      sort: z.enum(['newest', 'oldest', 'longest', 'shortest']).optional().describe('Default: newest.'),
      limit: LIMIT,
      offset: OFFSET,
      preview_chars: z.number().int().min(20).max(5000).optional().describe('Text preview length (default 300). Use get_dictation for the full text.')
    },
    annotations: READ_ONLY
  }, (args) => guarded(() => ok(listDictations(store.getHistory(), {
    range: resolveDateRange(args.from, args.to),
    query: args.query,
    minChars: args.min_chars,
    sort: args.sort,
    limit: args.limit,
    offset: args.offset,
    previewChars: args.preview_chars
  }))))

  server.registerTool('get_dictation', {
    description: 'Read the full text of one dictation.',
    inputSchema: { id: z.string() },
    annotations: READ_ONLY
  }, (args) => {
    const record = store.getHistoryItem(args.id)
    if (!record || record.status !== 'success') return fail(`Dictation ${args.id} not found`)
    return ok(getDictationView(record))
  })

  server.registerTool('digest', {
    description:
      'What happened, day by day (oldest first): meetings with summary brief and decisions, plus counters of dictations. '
      + 'Summaries only — no transcripts. Default period: the last 7 days.',
    inputSchema: { from: FROM, to: TO },
    annotations: READ_ONLY
  }, (args) => guarded(() => {
    const range = resolveDateRange(args.from ?? (args.to ? undefined : '7d'), args.to)
    return ok({ days: buildDigest(store.getHistory(), store.getMeetings(), range) })
  }))

  server.registerTool('add_meeting_note', {
    description:
      'Attach a note to a meeting: what was done after it, which tasks were created, links to them. '
      + 'The user sees the note in the app next to the meeting. Keep it short and factual.',
    inputSchema: {
      meeting_id: z.string(),
      text: z.string().min(1).max(MAX_NOTE_CHARS),
      author: z.string().max(60).optional().describe('Who writes it — your name, e.g. "Claude Code". Default: agent.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, (args) => {
    const updated = store.addMeetingNote(args.meeting_id, {
      text: args.text.trim(),
      source: 'agent',
      author: args.author?.trim() || AGENT_AUTHOR
    })
    if (!updated) return fail(`Meeting ${args.meeting_id} not found`)
    notifyNotes(host, updated)
    const note = updated.notes?.at(-1)
    return ok({ note: note && toNoteView(note), notesCount: updated.notes?.length ?? 0 })
  })

  server.registerTool('update_meeting_note', {
    description: 'Edit a note written by an agent (notes written by the user are read-only).',
    inputSchema: {
      meeting_id: z.string(),
      note_id: z.string(),
      text: z.string().min(1).max(MAX_NOTE_CHARS)
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, (args) => {
    const rejection = rejectUserNote(args.meeting_id, args.note_id)
    if (rejection) return rejection
    const updated = store.updateMeetingNote(args.meeting_id, args.note_id, args.text.trim())
    if (!updated) return fail('Note not found')
    notifyNotes(host, updated)
    return ok({ updated: true })
  })

  server.registerTool('delete_meeting_note', {
    description: 'Delete a note written by an agent (notes written by the user cannot be deleted from here).',
    inputSchema: { meeting_id: z.string(), note_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }, (args) => {
    const rejection = rejectUserNote(args.meeting_id, args.note_id)
    if (rejection) return rejection
    const updated = store.deleteMeetingNote(args.meeting_id, args.note_id)
    if (!updated) return fail('Note not found')
    notifyNotes(host, updated)
    return ok({ deleted: true })
  })

  return server
}

/** Заметки пользователя агент менять не может; для несуществующей заметки вернём null — пусть ответит store. */
function rejectUserNote(meetingId: string, noteId: string): CallToolResult | null {
  const note = store.getMeeting(meetingId)?.notes?.find((candidate) => candidate.id === noteId)
  return note?.source === 'user' ? fail('This note was written by the user — agents cannot change it') : null
}
