import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import CodeEmbedView from '../embeds/CodeEmbedView'

export const CodeEmbed = Node.create({
  name: 'codeEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id'),
        renderHTML: (attributes) => ({ 'data-block-id': attributes.blockId }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="code-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'code-embed' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeEmbedView)
  },
})
