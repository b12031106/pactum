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
import { ImageUpload } from "./extensions/image-upload"
import { DiscussionHighlight, type DiscussionAnchor } from "./extensions/discussion-highlight"
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
    const isValidContent = content && typeof content === 'object' && 'type' in (content as Record<string, unknown>)
    if (editor && isValidContent && !contentSetRef.current) {
      contentSetRef.current = true
      editor.commands.setContent(content as Parameters<typeof editor.commands.setContent>[0])
    }
  }, [editor, content])

  useEffect(() => {
    if (editor && editor.extensionManager.extensions.find(e => e.name === 'discussionHighlight')) {
      const ext = editor.extensionManager.extensions.find(e => e.name === 'discussionHighlight')
      if (ext) {
        ext.options.anchors = discussionAnchors
        editor.view.dispatch(editor.view.state.tr)
      }
    }
  }, [editor, discussionAnchors])

  return (
    <div className={`rounded-lg border ${editable ? 'border-border' : 'border-border border-dashed bg-muted/30'}`}>
      <div className={editable ? '' : 'opacity-50 pointer-events-none'}>
        <EditorToolbar editor={editor} />
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none min-h-[400px] p-4 focus:outline-none"
      />
    </div>
  )
}
