// Add custom matchers and serializers for ProseMirror
import { prosemirrorMatchers, prosemirrorSerializer } from "jest-prosemirror";
import { expect } from "vitest";

expect.extend(prosemirrorMatchers);
expect.addSnapshotSerializer(prosemirrorSerializer);
