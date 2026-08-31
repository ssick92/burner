"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";

import {
  COVER_EDITOR_FRAME_SIZE,
  COVER_EXPORT_SIZE,
  clampCoverTransform,
  createInitialCoverTransform,
  getCoverArtRenderSize,
  type CoverArtDimensions,
  type CoverArtTransform,
  updateCoverZoom,
} from "../lib/cover-art";

interface CoverArtFieldProps {
  value: string;
  onChange: (nextValue: string) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const MAX_FILE_SIZE = 12 * 1024 * 1024;

async function loadImageFromSource(sourceUrl: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    if (!sourceUrl.startsWith("data:") && !sourceUrl.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Burner could not load that image. Try another file."));
    image.src = sourceUrl;
  });
}

async function renderCoverDataUrl(
  image: HTMLImageElement,
  dimensions: CoverArtDimensions,
  transform: CoverArtTransform,
) {
  const canvas = document.createElement("canvas");
  canvas.width = COVER_EXPORT_SIZE;
  canvas.height = COVER_EXPORT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot edit cover art right now.");
  }

  const scale = COVER_EXPORT_SIZE / COVER_EDITOR_FRAME_SIZE;
  const renderSize = getCoverArtRenderSize(
    dimensions,
    COVER_EDITOR_FRAME_SIZE,
    transform.zoom,
  );

  context.drawImage(
    image,
    transform.offsetX * scale,
    transform.offsetY * scale,
    renderSize.width * scale,
    renderSize.height * scale,
  );

  return canvas.toDataURL("image/jpeg", 0.86);
}

export function CoverArtField({ value, onChange }: CoverArtFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [uploadedSourceUrl, setUploadedSourceUrl] = useState<string | null>(
    null,
  );
  const [editorSourceUrl, setEditorSourceUrl] = useState<string | null>(null);
  const [editorDimensions, setEditorDimensions] =
    useState<CoverArtDimensions | null>(null);
  const [editorTransform, setEditorTransform] =
    useState<CoverArtTransform | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previewSource = value || null;
  const editorRenderSize =
    editorDimensions && editorTransform
      ? getCoverArtRenderSize(
          editorDimensions,
          COVER_EDITOR_FRAME_SIZE,
          editorTransform.zoom,
        )
      : null;

  useEffect(() => {
    return () => {
      if (uploadedSourceUrl) {
        URL.revokeObjectURL(uploadedSourceUrl);
      }
    };
  }, [uploadedSourceUrl]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !editorBusy) {
        setEditorOpen(false);
        setDragging(false);
        dragStateRef.current = null;
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [editorBusy, editorOpen]);

  async function openEditor(sourceUrl: string) {
    setEditorBusy(true);
    setStatusMessage(null);

    try {
      const image = await loadImageFromSource(sourceUrl);
      const dimensions = {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };

      loadedImageRef.current = image;
      setEditorSourceUrl(sourceUrl);
      setEditorDimensions(dimensions);
      setEditorTransform(createInitialCoverTransform(dimensions));
      setEditorOpen(true);
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setEditorBusy(false);
    }
  }

  function replaceUploadedSource(nextSourceUrl: string) {
    setUploadedSourceUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return nextSourceUrl;
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatusMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setStatusMessage(
        "Keep cover art under 12 MB so Burner can process it quickly.",
      );
      return;
    }

    const nextSourceUrl = URL.createObjectURL(file);
    replaceUploadedSource(nextSourceUrl);
    await openEditor(nextSourceUrl);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDragging(false);
    dragStateRef.current = null;
  }

  function handleBackdropClick(
    target: EventTarget | null,
    currentTarget: EventTarget | null,
  ) {
    if (target === currentTarget && !editorBusy) {
      closeEditor();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!editorTransform) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: editorTransform.offsetX,
      originY: editorTransform.offsetY,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStateRef.current || !editorDimensions || !editorTransform) {
      return;
    }

    if (dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;

    setEditorTransform(
      clampCoverTransform(
        {
          zoom: editorTransform.zoom,
          offsetX: dragStateRef.current.originX + deltaX,
          offsetY: dragStateRef.current.originY + deltaY,
        },
        editorDimensions,
      ),
    );
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (
      !dragStateRef.current ||
      dragStateRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  async function handleSave() {
    if (!loadedImageRef.current || !editorDimensions || !editorTransform) {
      return;
    }

    setEditorBusy(true);

    try {
      const nextDataUrl = await renderCoverDataUrl(
        loadedImageRef.current,
        editorDimensions,
        editorTransform,
      );
      onChange(nextDataUrl);
      setStatusMessage("Cover art updated.");
      closeEditor();
    } catch {
      setStatusMessage(
        "Burner could not save that crop. Upload the image again and retry.",
      );
    } finally {
      setEditorBusy(false);
    }
  }

  function handleRemove() {
    onChange("");
    setStatusMessage("Cover art removed.");
    if (uploadedSourceUrl) {
      setUploadedSourceUrl(null);
    }
  }

  return (
    <div className="itunes-coverfield">
      <input
        accept="image/*"
        className="itunes-coverfield__input"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      <div
        className={`itunes-coverfield__preview ${previewSource ? "" : "itunes-coverfield__preview--empty"}`}
      >
        {previewSource ? (
          <NextImage
            alt="Selected cover art preview"
            fill
            sizes="140px"
            src={previewSource}
            unoptimized
          />
        ) : (
          <span>Drop a cover, or upload a square JPG or PNG.</span>
        )}
      </div>

      <div className="itunes-coverfield__actions">
        <button
          className="button button--secondary"
          disabled={editorBusy}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {previewSource ? "Replace Cover" : "Upload Cover"}
        </button>
        <button
          className="button button--secondary"
          disabled={editorBusy || (!uploadedSourceUrl && !previewSource)}
          onClick={() => {
            const source = uploadedSourceUrl ?? previewSource;
            if (source) {
              void openEditor(source);
            }
          }}
          type="button"
        >
          Adjust Crop
        </button>
        <button
          className="button button--secondary"
          disabled={editorBusy || !previewSource}
          onClick={handleRemove}
          type="button"
        >
          Remove
        </button>
      </div>

      <p className="itunes-coverfield__hint">
        Upload a JPG, PNG, or WebP. Burner crops it square for the player.
      </p>
      {statusMessage ? (
        <p className="itunes-coverfield__status">{statusMessage}</p>
      ) : null}

      {editorOpen &&
      editorSourceUrl &&
      editorDimensions &&
      editorTransform &&
      editorRenderSize ? (
        <div
          aria-modal="true"
          className="cover-editor"
          onClick={(event) =>
            handleBackdropClick(event.target, event.currentTarget)
          }
          role="dialog"
        >
          <div className="cover-editor__panel">
            <div className="cover-editor__header">
              <div className="stack-xs">
                <strong>Adjust Cover Art</strong>
                <p>Drag the image until the square crop feels right.</p>
              </div>
              <button
                className="button button--secondary"
                disabled={editorBusy}
                onClick={closeEditor}
                type="button"
              >
                Cancel
              </button>
            </div>

            <div className="cover-editor__body">
              <div
                className={`cover-editor__stage ${dragging ? "cover-editor__stage--dragging" : ""}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <NextImage
                  alt=""
                  className="cover-editor__image"
                  draggable={false}
                  height={Math.round(editorRenderSize.height)}
                  src={editorSourceUrl}
                  style={{
                    width: `${editorRenderSize.width}px`,
                    height: `${editorRenderSize.height}px`,
                    transform: `translate(${editorTransform.offsetX}px, ${editorTransform.offsetY}px)`,
                  }}
                  unoptimized
                  width={Math.round(editorRenderSize.width)}
                />
                <div className="cover-editor__frame" />
              </div>

              <div className="cover-editor__controls">
                <label className="cover-editor__slider">
                  <span>Zoom</span>
                  <input
                    max="3"
                    min="1"
                    onChange={(event) => {
                      const nextZoom = Number(event.target.value);
                      setEditorTransform((current) =>
                        current
                          ? updateCoverZoom(
                              current,
                              nextZoom,
                              editorDimensions,
                              COVER_EDITOR_FRAME_SIZE,
                            )
                          : current,
                      );
                    }}
                    step="0.01"
                    type="range"
                    value={editorTransform.zoom}
                  />
                </label>

                <div className="cover-editor__meta">
                  <span>
                    {editorDimensions.width} × {editorDimensions.height}
                  </span>
                  <span>
                    Exported as {COVER_EXPORT_SIZE} × {COVER_EXPORT_SIZE} JPEG
                  </span>
                </div>

                <div className="cover-editor__buttonrow">
                  <button
                    className="button button--secondary"
                    disabled={editorBusy}
                    onClick={() =>
                      setEditorTransform(
                        createInitialCoverTransform(editorDimensions),
                      )
                    }
                    type="button"
                  >
                    Reset
                  </button>
                  <button
                    className="button button--primary"
                    disabled={editorBusy}
                    onClick={() => void handleSave()}
                    type="button"
                  >
                    {editorBusy ? "Saving..." : "Save Cover"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
