// Walks the object graph produced by an NSKeyedArchiver-written bplist.
//
// NSKeyedArchiver stores every object as a dict keyed by property name plus
// a "$class" UID pointing at a class-description object ({$classname,
// $classes}). Containers (NSArray/NSSet/NSDictionary) are stored the same
// way but carry their payload under "NS.objects" (or NS.keys/NS.objects for
// dictionaries). We resolve UID -> object recursively and flatten class
// wrappers into a plain `__class__` string so callers get ordinary
// JS objects/arrays/strings instead of Apple's archive plumbing.

import { UID } from "./bplist";

export interface ArchivedTop {
  /** The archiver's "$objects" array. UID indices refer into this, not into
   * the raw bplist object table. */
  objects: unknown[];
  /** The resolved root object (what NSKeyedArchiver originally archived). */
  root: unknown;
}

/**
 * `bplistObjects`/`bplistTopIndex` come straight from `parseBinaryPlist`.
 * The bplist's own top-level value is the whole NSKeyedArchiver envelope
 * dict: {$version, $archiver, $top: {root: UID}, $objects: [...]}. This
 * unwraps that envelope and resolves the real root object.
 */
export function loadArchiveTop(
  bplistObjects: unknown[],
  bplistTopIndex: number
): ArchivedTop {
  const envelope = bplistObjects[bplistTopIndex] as Record<string, unknown>;
  if (!envelope || typeof envelope !== "object" || !("$objects" in envelope)) {
    throw new Error("Not an NSKeyedArchiver plist (missing $objects)");
  }
  const objects = envelope["$objects"] as unknown[];
  const top = envelope["$top"] as Record<string, unknown>;
  const rootRef = top?.root;
  if (!(rootRef instanceof UID)) {
    throw new Error("Archive $top.root is not a UID reference");
  }
  const root = resolve(objects, rootRef);
  return { objects, root };
}

function isClassDescriptor(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  return keys.every((k) => k === "$class" || k === "$classname" || k === "$classes");
}

export function resolve(
  objects: unknown[],
  value: unknown,
  seen: Set<number> = new Set()
): unknown {
  if (value instanceof UID) {
    const idx = value.index;
    if (seen.has(idx)) return undefined; // break cycles
    return resolve(objects, objects[idx], new Set(seen).add(idx));
  }

  if (value === "$null") return null;

  if (Array.isArray(value)) {
    return value.map((v) => resolve(objects, v, seen));
  }

  if (value instanceof Uint8Array || value instanceof Date) {
    return value;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if ("$class" in obj && isClassDescriptor(obj)) {
      return null; // pure class-description object, not real data
    }

    if ("NS.objects" in obj) {
      return resolve(objects, obj["NS.objects"], seen);
    }

    if ("NS.keys" in obj && "NS.objects" in obj) {
      // NSDictionary archived form; not used by .tab files but handled
      // for completeness.
      const keys = resolve(objects, obj["NS.keys"], seen) as unknown[];
      const vals = resolve(objects, obj["NS.objects"], seen) as unknown[];
      const dict: Record<string, unknown> = {};
      keys.forEach((k, i) => (dict[String(k)] = vals[i]));
      return dict;
    }

    let className: string | undefined;
    if (obj.$class instanceof UID) {
      const classObj = objects[obj.$class.index] as Record<string, unknown>;
      className = classObj?.$classname as string | undefined;
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$class") continue;
      result[k] = resolve(objects, v, seen);
    }
    if (className) result.__class__ = className;
    return result;
  }

  return value;
}
