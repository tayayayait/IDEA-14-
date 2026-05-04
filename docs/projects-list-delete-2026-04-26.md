# Projects List Delete (2026-04-26)

## Scope
- Add per-item delete action on the analysis projects list screen.
- Keep existing "continue" navigation behavior.

## Updated File
- `src/pages/Projects.tsx`

## Behavior
1. Each project row now has a delete button (trash icon).
2. Clicking delete opens a confirmation prompt.
3. On confirm, the app deletes the row from `projects` table via Supabase.
4. After success, the item is removed from local list state immediately and success toast is shown.
5. While deleting one item, that item's delete button shows loading state and is disabled.

## Data Notes
- Related project data in child tables is removed by DB `ON DELETE CASCADE` constraints already defined in migrations.

## Verification
- Manual check on `/projects`:
  - Delete button appears for every list item.
  - Cancel in confirm prompt keeps item unchanged.
  - Confirm removes only selected item and does not navigate.
  - Continue button still moves to resume path as before.
