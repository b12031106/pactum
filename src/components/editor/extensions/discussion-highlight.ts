import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface DiscussionAnchor {
  discussionId: string
  from: number
  to: number
  status: string
}

export const highlightKey = new PluginKey('discussionHighlight')

function buildDecorations(doc: { content: { size: number } }, anchors: DiscussionAnchor[]): DecorationSet {
  if (!anchors.length) return DecorationSet.empty

  const decorations: Decoration[] = []
  const docSize = doc.content.size

  for (const anchor of anchors) {
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

  return DecorationSet.create(doc as Parameters<typeof DecorationSet.create>[0], decorations)
}

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
        state: {
          init(_, state) {
            const { anchors } = extension.options as { anchors: DiscussionAnchor[] }
            return buildDecorations(state.doc, anchors)
          },
          apply(tr, oldDecorations, _oldState, newState) {
            // Check for explicit anchor update via metadata
            const meta = tr.getMeta(highlightKey)
            if (meta?.anchors) {
              return buildDecorations(newState.doc, meta.anchors)
            }
            // Remap on doc changes
            if (tr.docChanged) {
              return oldDecorations.map(tr.mapping, newState.doc)
            }
            return oldDecorations
          },
        },
        props: {
          decorations(state) {
            return highlightKey.getState(state) ?? DecorationSet.empty
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
