import { Mark, markInputRule } from '@tiptap/core'

/**
 * NoteLink — renders [[Note Title]] as a clickable yellow chip.
 *
 * Typing [[Some Note]] in the editor converts it to a NoteLink mark.
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

  // Convert [[Note Title]] → NoteLink mark when the closing ]] is typed.
  // The last capture group becomes the preserved text; we store the inner
  // name as an attribute by stripping the [[ and ]].
  addInputRules() {
    return [
      markInputRule({
        find: /(\[\[[^\]]+\]\])$/,
        type: this.type,
        getAttributes: (match) => ({ noteName: match[1].slice(2, -2).trim() }),
      }),
    ]
  },
})
