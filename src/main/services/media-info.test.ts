import { describe, expect, it } from 'vitest'
import { parseMediaInfo } from './media-info'

const VIDEO_WITH_SOUND = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'call.mp4':
  Duration: 01:02:05.50, start: 0.000000, bitrate: 106 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080, 10 fps (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
Output #0, ffmetadata, to 'pipe:':
Stream mapping:
size=       0kB time=N/A bitrate=N/A speed=N/A`

describe('parseMediaInfo', () => {
  it('видео со звуком: длительность, оба потока', () => {
    expect(parseMediaInfo(VIDEO_WITH_SOUND)).toEqual({ durationMs: 3_725_500, hasAudio: true, hasVideo: true })
  })

  it('обложка аудиофайла — не видео', () => {
    const stderr = `Input #0, mp3, from 'voice.mp3':
  Duration: 00:00:04.05, start: 0.025057, bitrate: 64 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, mono, fltp, 64 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc), 600x600, 90k tbr, 90k tbn (attached pic)`
    expect(parseMediaInfo(stderr)).toMatchObject({ hasAudio: true, hasVideo: false })
  })

  it('видео без звука', () => {
    const stderr = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'screen.mp4':
  Duration: 00:00:03.00, start: 0.000000, bitrate: 39 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 320x240 (default)`
    expect(parseMediaInfo(stderr)).toMatchObject({ hasAudio: false, hasVideo: true })
  })

  it('потоки выхода не считаются потоками файла', () => {
    const stderr = `Input #0, mp3, from 'voice.mp3':
  Duration: 00:00:04.05, start: 0.025057, bitrate: 64 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, mono, fltp, 64 kb/s
Output #0, mp4, to 'out.mp4':
  Stream #0:0: Video: h264, yuv420p, 320x240`
    expect(parseMediaInfo(stderr).hasVideo).toBe(false)
  })

  it('без длительности в контейнере — null', () => {
    const stderr = `Input #0, matroska,webm, from 'recording.webm':
  Duration: N/A, start: 0.000000, bitrate: N/A
  Stream #0:0: Audio: opus, 48000 Hz, stereo, fltp (default)`
    expect(parseMediaInfo(stderr).durationMs).toBeNull()
  })
})
