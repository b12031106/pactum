import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface DiscussionAnchor {
  discussionId: string
  from: number
  to: number
  status: string
}

const highlightKey = new PluginKey('discussionHighlight')

export const DiscussionHighlight = Extension.create({
  name: 'discussionHighlight',

  addOptions() {
    return {
      anchors: [] as DiscussionAnchor[],
      onClickAnchor: (_discussionId: string) => {},
    }
  },

  addProseMirrorPlugins() {
    const extension = this

    return [
      new Plugin({
        key: highlightKey,
        props: {
          decorations(state) {
            const { anchors } = extension.options as { anchors: DiscussionAnchor[] }
            if (!anchors.length) return DecorationSet.empty

            const decorations: Decoration[] = []
            const docSize = state.doc.content.size

            for (const anchor of anchors) {
              // Validate positions are within document bounds
              if (anchor.from < 0 || anchor.to > docSize || anchor.from >= anchor.to) continue

              const isOpen = anchor.status === 'open'
              decorations.push(
                Decoration.inline(anchor.from, anchor.to, {
                  class: isOpen
                    ? 'discussion-highlight discussion-highlight--open'
                    : 'discussion-highlight discussion-highlight--resolved',
                  'data-discussion-id': anchor.discussionId,
                })
              )
            }

            return DecorationSet.create(state.doc, decorations)
          },

          handleClick(view, pos) {
            const { onClickAnchor, anchors } = extension.options as {
              onClickAnchor: (id: string) => void
              anchors: DiscussionAnchor[]
            }
            for (const anchor of anchors) {
              if (pos >= anchor.from && pos <= anchor.to) {
                onClickAnchor(anchor.discussionId)
                return true
              }
            }
            return false
          },
        },
      }),
    ]
  },
})
