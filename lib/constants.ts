import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

export const suggestions = [
  "幫我整理這份文件，列出重點、風險和下一步",
  "把這些會議紀錄整理成待辦清單和負責人",
  "幫我草擬一封專業但好溝通的工作郵件",
  "分析這份表格，找出趨勢、異常和可行建議",
];
