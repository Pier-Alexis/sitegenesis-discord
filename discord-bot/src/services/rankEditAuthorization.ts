export const SD_GROUP_ID = "225026228";
export const MTF_GROUP_ID = "574906909";

// Exact rank numbers of roles allowed to edit ranks, once you send me the JSON:
const AUTHORIZED_RANKS: Readonly<Record<string, ReadonlySet<number>>> = {
    [SD_GROUP_ID]: new Set([/* SD Director, SD Deputy Director, SD Captain rank numbers */]),
    [MTF_GROUP_ID]: new Set([/* MTF Director, MTF Deputy Director, MTF Instructor rank numbers */])
};

export function isAuthorizedRankEditor(groupId: string, executorRank: number): boolean {
    return AUTHORIZED_RANKS[groupId]?.has(executorRank) ?? false;
}