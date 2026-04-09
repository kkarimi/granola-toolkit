import type {
  GranolaAutomationArtefact,
  GranolaAutomationMatch,
  GranolaMeetingBundle,
  GranolaPkmPublishPreview,
  GranolaPkmTarget,
} from "./app/index.ts";
import {
  buildGranolaAutomationKnowledgeBaseBundle,
  buildGranolaYazdKnowledgeBaseRef,
  legacyPkmPreviewFromYazdKnowledgeBasePreview,
  legacyPkmSyncResultFromYazdKnowledgeBasePublishResult,
  previewGranolaYazdKnowledgeBasePublishSync,
  publishGranolaYazdKnowledgeBase,
} from "./yazd-knowledge-bases.ts";

export function previewMarkdownVaultTarget(options: {
  artefact: GranolaAutomationArtefact;
  bundle: GranolaMeetingBundle;
  match: GranolaAutomationMatch;
  target: GranolaPkmTarget;
}): GranolaPkmPublishPreview {
  void options.match;

  return legacyPkmPreviewFromYazdKnowledgeBasePreview(
    previewGranolaYazdKnowledgeBasePublishSync({
      bundle: buildGranolaAutomationKnowledgeBaseBundle({
        artefact: options.artefact,
        bundle: options.bundle,
      }),
      knowledgeBase: buildGranolaYazdKnowledgeBaseRef(options.target),
    }),
  );
}

export async function syncMarkdownVaultTarget(options: {
  artefact: GranolaAutomationArtefact;
  bundle: GranolaMeetingBundle;
  match: GranolaAutomationMatch;
  target: GranolaPkmTarget;
}): Promise<{
  dailyNoteFilePath?: string;
  dailyNoteOpenUrl?: string;
  filePath: string;
  noteOpenUrl?: string;
  transcriptFilePath?: string;
  transcriptOpenUrl?: string;
  written: number;
}> {
  void options.match;

  return legacyPkmSyncResultFromYazdKnowledgeBasePublishResult(
    await publishGranolaYazdKnowledgeBase({
      bundle: buildGranolaAutomationKnowledgeBaseBundle({
        artefact: options.artefact,
        bundle: options.bundle,
      }),
      knowledgeBase: buildGranolaYazdKnowledgeBaseRef(options.target),
    }),
  );
}
