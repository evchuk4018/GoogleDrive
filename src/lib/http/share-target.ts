import { NextResponse } from "next/server";

import { isRequestAuthorized } from "@/lib/auth/auth";
import { drivePublicPath } from "@/lib/config/drive-public-path";
import {
  type SharedUploadFile,
  type SharedUploadResult,
  uploadSharedFiles,
} from "@/lib/domain/share-upload";

export type ShareTargetDependencies = {
  isAuthorized?: (request: Request) => boolean | Promise<boolean>;
  uploadFiles?: (files: readonly SharedUploadFile[]) => Promise<SharedUploadResult>;
};

function redirectToDrive(request: Request, params: Record<string, string>) {
  const target = new URL(drivePublicPath("/"), request.url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return NextResponse.redirect(target, 303);
}

function isFileEntry(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && typeof value.name === "string" && typeof value.stream === "function";
}

function sharedFiles(formData: FormData): SharedUploadFile[] {
  return formData.getAll("files").filter(isFileEntry).map((file) => ({
    name: file.name,
    mimeType: file.type || undefined,
    body: file.stream(),
  }));
}

export async function handleShareTarget(
  request: Request,
  dependencies: ShareTargetDependencies = {},
): Promise<NextResponse> {
  const authorized = dependencies.isAuthorized
    ? await dependencies.isAuthorized(request)
    : await isRequestAuthorized(request);

  if (!authorized) return redirectToDrive(request, { share: "signin" });

  try {
    const files = sharedFiles(await request.formData());
    if (files.length === 0) return redirectToDrive(request, { shared: "empty" });

    const result = await (dependencies.uploadFiles ?? uploadSharedFiles)(files);
    return redirectToDrive(request, {
      shared: result.failed > 0 ? "partial" : "success",
      uploaded: String(result.uploaded),
      failed: String(result.failed),
    });
  } catch (error) {
    console.error("Share target upload failed", error);
    return redirectToDrive(request, { shared: "error" });
  }
}
