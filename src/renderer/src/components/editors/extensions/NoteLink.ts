import { Mark, markInputRule } from '@tiptap/core'

/**
 * NoteLink — renders [[Note Title]] as a clickable yellow chip.
 *
 * Typing [[Some Note]] in the editor converts it to a NoteLink mark.
 * The [[ and ]] brackets are consumed; only the title text is preserved
 * as the display content, wrapped in the mark.
 *
 * The consuming component handles click events by checking for
 * elements with class "note-link" and reading data-note-name.
 */
export const NoteLink = Mark.create({
  name: 'noteLink',

  addAttributes() {
    return {
      noteName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-name'),
        renderHTML: (attributes) => ({ 'data-note-name': attributes.noteName }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-note-name]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'note-link' }, 0]
  },

  // The LAST capture group in the regex is the text that gets preserved.
  // \[\[ and \]\] are outside the capture group so they are consumed.
  // Result: "[[My Note]]" → chip displaying "My Note"
  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ noteName: match[1].trim() }),
      }),
    ]
  },
})
