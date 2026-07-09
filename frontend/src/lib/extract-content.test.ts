import { describe, expect, it } from 'vitest'

import { parseSelection, segmentText } from './extract-content'

describe('segmentText', () => {
  it('produces verbatim spans of the source', () => {
    const source =
      'Jeff: I use TruckDown but I still have to call every shop myself to check they actually service reefers. ' +
      'Jen: The numbers in Pear Tree never match what QuickBooks says, so I re-enter everything on Sundays. ' +
      'Jeff: We pay six hundred and fifty a month for that thing and it still cannot produce one clean report.'
    const segments = segmentText(source)
    expect(segments.length).toBeGreaterThan(0)
    // Every segment must be reconstructable from the source (whitespace aside).
    const flat = source.replace(/\s+/g, ' ')
    for (const segment of segments) {
      expect(flat).toContain(segment.replace(/\s+/g, ' '))
    }
  })

  it('splits long text into multiple segments', () => {
    const sentence = 'This is a fairly ordinary sentence about reefer trailers and paperwork. '
    const segments = segmentText(sentence.repeat(30))
    expect(segments.length).toBeGreaterThan(5)
  })

  it('bounds segment size even with no sentence punctuation', () => {
    const runOn = 'so then we looked at the compressor and the gauge read forty psi '.repeat(60)
    const segments = segmentText(runOn)
    expect(segments.length).toBeGreaterThan(4)
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(600)
    }
  })
})

describe('parseSelection', () => {
  it('parses plain numbers and ranges', () => {
    expect(parseSelection('2, 5-8, 14', 20)).toEqual([2, 5, 6, 7, 8, 14])
  })

  it('ignores chatter around the numbers', () => {
    expect(parseSelection('Sure! I would keep segments 3 and 7-9.', 10)).toEqual([3, 7, 8, 9])
  })

  it('drops out-of-range numbers and dedupes', () => {
    expect(parseSelection('0, 3, 3, 99', 10)).toEqual([3])
  })

  it('handles reversed ranges', () => {
    expect(parseSelection('9-7', 10)).toEqual([7, 8, 9])
  })

  it('returns empty for no numbers', () => {
    expect(parseSelection('I cannot decide.', 10)).toEqual([])
  })
})
