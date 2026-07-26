import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "yaml";
import {
  characterProfileSchema,
  styleExamplesSchema,
  styleProfileSchema,
  type CharacterProfile,
  type StyleExamples,
  type StyleProfile
} from "./schema.js";

export type LoadedCharacterProfile = {
  path: string;
  profile: CharacterProfile;
};

async function yamlFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export async function loadCharacterProfiles(workspace: string): Promise<LoadedCharacterProfile[]> {
  const directory = path.join(workspace, "planning", "characters");
  const files = await yamlFiles(directory);
  const loaded: LoadedCharacterProfile[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const file of files) {
    const relative = `planning/characters/${file}`;
    const profile = characterProfileSchema.parse(
      parse(await fs.readFile(path.join(workspace, relative), "utf8"))
    );
    if (ids.has(profile.id)) throw new Error(`Duplicate character profile id: ${profile.id}`);
    if (names.has(profile.name)) throw new Error(`Duplicate character profile name: ${profile.name}`);
    ids.add(profile.id);
    names.add(profile.name);
    loaded.push({ path: relative, profile });
  }
  for (const { profile } of loaded) {
    const unknown = profile.relationshipVoices
      .map((item) => item.characterId)
      .filter((characterId) => !ids.has(characterId));
    if (unknown.length > 0) {
      throw new Error(
        `Character profile ${profile.id} references unknown relationship voices: ${unknown.join(", ")}`
      );
    }
  }
  return loaded;
}

export async function selectCharacterProfiles(
  workspace: string,
  participants: readonly string[]
): Promise<LoadedCharacterProfile[]> {
  const profiles = await loadCharacterProfiles(workspace);
  const requested = new Set(participants);
  const selected = profiles.filter(
    ({ profile }) => requested.has(profile.id) || requested.has(profile.name)
  );
  const matched = new Set(
    selected.flatMap(({ profile }) => [profile.id, profile.name])
  );
  const missing = participants.filter((participant) => !matched.has(participant));
  if (missing.length > 0) {
    throw new Error(`Chapter participants are missing character profiles: ${missing.join(", ")}`);
  }
  return selected;
}

export async function readStyleProfile(workspace: string): Promise<StyleProfile> {
  return styleProfileSchema.parse(
    parse(
      await fs.readFile(
        path.join(workspace, "planning", "style-profile.yaml"),
        "utf8"
      )
    )
  );
}

export async function readStyleExamples(workspace: string): Promise<StyleExamples> {
  return styleExamplesSchema.parse(
    parse(
      await fs.readFile(
        path.join(workspace, "planning", "style-examples.yaml"),
        "utf8"
      )
    )
  );
}

export async function validateCreativeProfiles(workspace: string): Promise<void> {
  const profiles = await loadCharacterProfiles(workspace);
  if (profiles.length === 0) {
    throw new Error("At least one structured character profile is required.");
  }
  await readStyleProfile(workspace);
  await readStyleExamples(workspace);
}
