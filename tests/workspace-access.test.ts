import assert from "node:assert/strict"
import test from "node:test"
import { resolveWorkspacePermission } from "@/lib/supabase/workspace-permission"

test("owner always has full workspace access", () => {
  assert.deepEqual(resolveWorkspacePermission("owner", "active", null), { canView: true, canEdit: true })
})

test("viewer never receives edit access", () => {
  assert.deepEqual(resolveWorkspacePermission("viewer", "active", { can_view: true, can_edit: true }), { canView: true, canEdit: false })
})

test("collaborator edit requires both view and edit permission", () => {
  assert.deepEqual(resolveWorkspacePermission("collaborator", "active", { can_view: true, can_edit: true }), { canView: true, canEdit: true })
  assert.deepEqual(resolveWorkspacePermission("collaborator", "active", { can_view: false, can_edit: true }), { canView: false, canEdit: false })
})

test("disabled member has no access even when permission rows remain", () => {
  assert.deepEqual(resolveWorkspacePermission("collaborator", "disabled", { can_view: true, can_edit: true }), { canView: false, canEdit: false })
})
