export const SD_GROUP_ID = "225026228";
export const MTF_GROUP_ID = "574906909";

// Exact rank numbers of roles allowed to edit ranks.
// SD: Captain (230), Deputy Director (240), Director (250)
// MTF: Captain (220), Deputy Director (240), Director (250)
const AUTHORIZED_RANKS: Readonly<Record<string, ReadonlySet<number>>> = {
    [SD_GROUP_ID]: new Set([230, 240, 250, 254, 255]),
    [MTF_GROUP_ID]: new Set([220, 240, 250, 254, 255]),
};

export function isAuthorizedRankEditor(groupId: string, executorRank: number): boolean {
    return AUTHORIZED_RANKS[groupId]?.has(executorRank) ?? false;
}