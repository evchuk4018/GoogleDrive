import { getDriveService } from "@/lib/domain/drive-service";
import type { UploadInput } from "@/lib/domain/drive-service";
import { ValidationError } from "@/lib/domain/errors";

export type SharedUploadFile = Pick<UploadInput, "name" | "mimeType" | "body">;

export type SharedUploadResult = {
  uploaded: number;
  failed: number;
};

type UploadService = Pick<ReturnType<typeof getDriveService>, "upload">;

/** Upload every file from a system share into the Drive root. */
export async function uploadSharedFiles(
  files: readonly SharedUploadFile[],
  service: UploadService = getDriveService(),
): Promise<SharedUploadResult> {
  if (files.length === 0) {
    throw new ValidationError("At least one file is required for a shared upload");
  }

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    try {
      await service.upload({
        parentId: null,
        name: file.name,
        mimeType: file.mimeType,
        body: file.body,
      });
      uploaded += 1;
    } catch {
      // Continue so one duplicate or invalid file does not prevent the rest
      // of a multi-file share from reaching Drive.
      failed += 1;
    }
  }

  return { uploaded, failed };
}
