import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

async function uploadImage(file: File, documentId: string): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('documentId', documentId);
  const res = await fetch('/api/upload/image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Upload failed');
  const { data } = await res.json();
  return data.url;
}

function isImageFile(file: File): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
}

function insertImage(view: EditorView, url: string, pos?: number) {
  const { schema } = view.state;
  const node = schema.nodes.image.create({ src: url });
  const insertPos = pos ?? view.state.selection.from;
  const tr = view.state.tr.insert(insertPos, node);
  view.dispatch(tr);
}

export interface ImageUploadOptions {
  documentId: string;
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: 'imageUpload',

  addOptions() {
    return {
      documentId: '',
    };
  },

  addProseMirrorPlugins() {
    const { documentId } = this.options;

    return [
      new Plugin({
        key: new PluginKey('imageUpload'),
        props: {
          handlePaste(view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;

            for (const item of Array.from(items)) {
              if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && isImageFile(file)) {
                  event.preventDefault();
                  uploadImage(file, documentId).then((url) => {
                    insertImage(view, url);
                  });
                  return true;
                }
              }
            }
            return false;
          },

          handleDrop(view, event) {
            const files = event.dataTransfer?.files;
            if (!files?.length) return false;

            const imageFiles = Array.from(files).filter(isImageFile);
            if (!imageFiles.length) return false;

            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;

            for (const file of imageFiles) {
              uploadImage(file, documentId).then((url) => {
                insertImage(view, url, pos);
              });
            }
            return true;
          },
        },
      }),
    ];
  },
});
