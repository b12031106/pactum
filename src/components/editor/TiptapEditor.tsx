"use client"

import { useEffect, useRef } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { Image } from "@tiptap/extension-image"
import { Link } from "@tiptap/extension-link"
import { Placeholder } from "@tiptap/extension-placeholder"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { Markdown } from "tiptap-markdown"
import { common, createLowlight } from "lowlight"
import { Underline } from "@tiptap/extension-underline"
import { TextAlign } from "@tiptap/extension-text-align"
import { ImageUpload } from "./extensions/image-upload"
import { DiscussionHighlight, highlightKey, type DiscussionAnchor } from "./extensions/discussion-highlight"
import { EditorToolbar } from "./EditorToolbar"

const lowlight = createLowlight(common)

interface TiptapEditorProps {
  content: unknown
  onUpdate: (json: unknown) => void
  onEditorReady?: (editor: Editor) => void
  editable?: boolean
  placeholder?: string
  documentId?: string
  discussionAnchors?: DiscussionAnchor[]
  onDiscussionClick?: (discussionId: string) => void
}

export function TiptapEditor({
  content,
  onUpdate,
  onEditorReady,
  editable = true,
  placeholder = "Start writing...",
  documentId,
  discussionAnchors = [],
  onDiscussionClick,
}: TiptapEditorProps) {
  const contentSetRef = useRef(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Markdown,
      ...(documentId ? [ImageUpload.configure({ documentId })] : []),
      DiscussionHighlight.configure({
        anchors: discussionAnchors,
        onClickAnchor: onDiscussionClick ?? (() => {}),
      }),
    ],
    editable,
    onCreate({ editor: createdEditor }) {
      onEditorReady?.(createdEditor)
    },
    onUpdate({ editor: updatedEditor }) {
      onUpdate(updatedEditor.getJSON())
    },
  })

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  useEffect(() => {
    if (!editor || contentSetRef.current) return
    // Accept both JSON content (object with 'type') and markdown strings
    if (typeof content === 'string' && content.length > 0) {
      contentSetRef.current = true
      editor.commands.setContent(content)
    } else if (content && typeof content === 'object' && 'type' in (content as Record<string, unknown>)) {
      contentSetRef.current = true
      editor.commands.setContent(content as Parameters<typeof editor.commands.setContent>[0])
    }
  }, [editor, content])

  useEffect(() => {
    if (editor) {
      // Update anchors for click handling
      const ext = editor.extensionManager.extensions.find(e => e.name === 'discussionHighlight')
      if (ext) ext.options.anchors = discussionAnchors
      // Dispatch metadata to trigger decoration rebuild
      editor.view.dispatch(
        editor.view.state.tr.setMeta(highlightKey, { anchors: discussionAnchors })
      )
    }
  }, [editor, discussionAnchors])

  return (
    <div className={`rounded-lg border overflow-hidden ${editable ? 'border-border' : 'border-dashed bg-muted/30'}`}>
      <div className={`sticky top-0 z-10 bg-background ${!editable ? 'opacity-50 pointer-events-none' : ''}`}>
        <EditorToolbar editor={editor} />
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-neutral dark:prose-invert prose-sm max-w-none min-h-[400px] px-8 py-6 focus:outline-none"
      />
    </div>
  )
}
