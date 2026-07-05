export type ErrorType =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limit"
  | "offline";

export type Surface =
  | "chat"
  | "auth"
  | "api"
  | "stream"
  | "database"
  | "history"
  | "vote"
  | "document"
  | "suggestions"
  | "activate_gateway";

export type ErrorCode = `${ErrorType}:${Surface}`;

export type ErrorVisibility = "response" | "log" | "none";

export const visibilityBySurface: Record<Surface, ErrorVisibility> = {
  database: "log",
  chat: "response",
  auth: "response",
  stream: "response",
  api: "response",
  history: "response",
  vote: "response",
  document: "response",
  suggestions: "response",
  activate_gateway: "response",
};

export class ChatbotError extends Error {
  type: ErrorType;
  surface: Surface;
  statusCode: number;

  constructor(errorCode: ErrorCode, cause?: string) {
    super();

    const [type, surface] = errorCode.split(":");

    this.type = type as ErrorType;
    this.cause = cause;
    this.surface = surface as Surface;
    this.message = getMessageByErrorCode(errorCode);
    this.statusCode = getStatusCodeByType(this.type);
  }

  toResponse() {
    const code: ErrorCode = `${this.type}:${this.surface}`;
    const visibility = visibilityBySurface[this.surface];

    const { message, cause, statusCode } = this;

    if (visibility === "log") {
      console.error({
        code,
        message,
        cause,
      });

      return Response.json(
        { code: "", message: "發生錯誤，請稍後再試。" },
        { status: statusCode }
      );
    }

    return Response.json({ code, message, cause }, { status: statusCode });
  }
}

export function getMessageByErrorCode(errorCode: ErrorCode): string {
  if (errorCode.includes("database")) {
    return "執行資料庫查詢時發生錯誤。";
  }

  switch (errorCode) {
    case "bad_request:api":
      return "無法處理此請求，請確認您的輸入內容後再試一次。";

    case "bad_request:activate_gateway":
      return "AI Gateway 需要一張有效的信用卡才能提供服務。請前往 https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card 新增卡片以解鎖您的免費額度。";

    case "unauthorized:auth":
      return "請先登入才能繼續。";
    case "forbidden:auth":
      return "您的帳號沒有存取此功能的權限。";

    case "rate_limit:chat":
      return "您已達到訊息數量上限，請於 1 小時後再回來繼續對話。";
    case "not_found:chat":
      return "找不到指定的對話，請確認對話 ID 後再試一次。";
    case "forbidden:chat":
      return "此對話屬於其他使用者，請確認對話 ID 後再試一次。";
    case "unauthorized:chat":
      return "您需要登入才能檢視此對話，請登入後再試一次。";
    case "offline:chat":
      return "傳送訊息時發生問題，請檢查您的網路連線後再試一次。";

    case "not_found:document":
      return "找不到指定的文件，請確認文件 ID 後再試一次。";
    case "forbidden:document":
      return "此文件屬於其他使用者，請確認文件 ID 後再試一次。";
    case "unauthorized:document":
      return "您需要登入才能檢視此文件，請登入後再試一次。";
    case "bad_request:document":
      return "建立或更新文件的請求無效，請確認您的輸入內容後再試一次。";

    default:
      return "發生錯誤，請稍後再試。";
  }
}

function getStatusCodeByType(type: ErrorType) {
  switch (type) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "rate_limit":
      return 429;
    case "offline":
      return 503;
    default:
      return 500;
  }
}
