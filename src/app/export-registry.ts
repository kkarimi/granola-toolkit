import type {
  GranolaAppExportJobState,
  GranolaExportJobKind,
  GranolaExportRunOptions,
  GranolaNotesExportResult,
  GranolaTranscriptsExportResult,
} from "./types.ts";
import type { NoteOutputFormat, TranscriptOutputFormat } from "../types.ts";
import { GranolaCapabilityRegistry } from "../registry.ts";
import type { GranolaExportService } from "./export-service.ts";

export interface GranolaExporterDefinition {
  export(
    service: GranolaExportService,
    format: string,
    options: GranolaExportRunOptions,
  ): Promise<GranolaNotesExportResult | GranolaTranscriptsExportResult>;
  kind: GranolaExportJobKind;
  rerun(
    service: GranolaExportService,
    job: GranolaAppExportJobState,
  ): Promise<GranolaNotesExportResult | GranolaTranscriptsExportResult>;
}

export type GranolaExporterRegistry = GranolaCapabilityRegistry<
  GranolaExportJobKind,
  GranolaExporterDefinition
>;

export function createGranolaExporterRegistry(): GranolaExporterRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaExporterRegistry(): GranolaExporterRegistry {
  return createGranolaExporterRegistry()
    .register("notes", {
      kind: "notes",
      async export(service, format, options) {
        const request = await service.prepareNotesExport(format as NoteOutputFormat, options);
        return await service.runNotesExport(request);
      },
      async rerun(service, job) {
        return await service.exportNotes(job.format as NoteOutputFormat, {
          folderId: job.scope.mode === "folder" ? job.scope.folderId : undefined,
          outputDir: job.targetId ? undefined : job.outputDir,
          scopedOutput: job.scopedOutput ?? false,
          targetId: job.targetId,
        });
      },
    })
    .register("transcripts", {
      kind: "transcripts",
      async export(service, format, options) {
        const request = await service.prepareTranscriptsExport(
          format as TranscriptOutputFormat,
          options,
        );
        return await service.runTranscriptsExport(request);
      },
      async rerun(service, job) {
        return await service.exportTranscripts(job.format as TranscriptOutputFormat, {
          folderId: job.scope.mode === "folder" ? job.scope.folderId : undefined,
          outputDir: job.targetId ? undefined : job.outputDir,
          scopedOutput: job.scopedOutput ?? false,
          targetId: job.targetId,
        });
      },
    });
}
