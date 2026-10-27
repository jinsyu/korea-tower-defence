import index from "../../../../data/source/gojang/regions/20261001/index.json";

const NAMES = new Map(index.sigungu.map((r) => [r.code, r.name]));

/** Region name for a code, e.g. "11010" → "종로구". */
export const regionName = (code: string): string => NAMES.get(code) ?? code;
