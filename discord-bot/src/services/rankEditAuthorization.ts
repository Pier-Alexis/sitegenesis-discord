export const SD_GROUP_ID = "225026228";
export const MTF_GROUP_ID = "574906909";
export const MAIN_GROUP_ID = "165095337"; // Site: 45 Development Den / main community group

const AUTHORIZED_RANKS: Readonly<Record<string, ReadonlySet<number>>> = {
    [SD_GROUP_ID]: new Set([230, 240, 250, 254, 255]),
    [MTF_GROUP_ID]: new Set([220, 240, 250, 254, 255]),
    [MAIN_GROUP_ID]: new Set([190, 200, 254, 255]),
};

export function isAuthorizedRankEditor(groupId: string, executorRank: number): boolean {
    return AUTHORIZED_RANKS[groupId]?.has(executorRank) ?? false;
}