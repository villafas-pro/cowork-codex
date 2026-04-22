import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import FlowEmbedView from '../embeds/FlowEmbedView'

export const FlowEmbed = Node.create({
  name: 'flowEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      flowId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-flow-id'),
        renderHTML: (attributes) => ({ 'data-flow-id': attributes.flowId }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="flow-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'flow-embed' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlowEmbedView, { stopEvent: () => true })
  },
})
