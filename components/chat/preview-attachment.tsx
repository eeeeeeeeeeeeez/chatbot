import Image from "next/image";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

function getFileLabel(name: string | undefined, contentType: string | undefined) {
  if (contentType?.includes("pdf")) {
    return "PDF";
  }

  if (contentType?.includes("word")) {
    return "DOCX";
  }

  if (contentType?.includes("powerpoint") || contentType?.includes("presentation")) {
    return "PPTX";
  }

  if (contentType?.includes("excel") || contentType?.includes("spreadsheet")) {
    return "XLSX";
  }

  const extension = name?.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 5 ? extension : "FILE";
}

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const fileLabel = getFileLabel(name, contentType);

  return (
    <div
      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted"
      data-testid="input-attachment-preview"
      title={name}
    >
      {contentType?.startsWith("image") ? (
        <Image
          alt={name ?? "attachment"}
          className="size-full object-cover"
          height={96}
          src={url}
          width={96}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-muted-foreground">
          <span className="rounded-md border border-border/50 bg-background/70 px-1.5 py-0.5 font-medium text-[11px] text-foreground">
            {fileLabel}
          </span>
          {name && (
            <span className="line-clamp-2 break-all text-[10px] leading-tight">
              {name}
            </span>
          )}
        </div>
      )}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      )}

      {onRemove && !isUploading && (
        <button
          aria-label="移除附件"
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
