import { config, isApiConfigured } from "./config";
import {
  getDemoConsultantBySlug,
  getFilteredDemoConsultants,
  mergeConsultantLists
} from "./demo-data";
import { getCvUploadContentType, getDocumentUploadContentType } from "./uploads";
import type {
  AdminConsultantDetail,
  AdminConsultantSummary,
  Booking,
  ConsultantMediaKind,
  ConsultantProfile,
  ConsultantProfileStatus,
  ConsultantProfileType,
  PlanTier,
  UploadedDocument,
  UserProfile,
  UserRole
} from "./types";

type BootstrapInput = {
  email: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
  avatarUrl?: string;
  city?: string;
  occupation?: string;
  headline?: string;
  consultantProfileType?: ConsultantProfileType;
};

type UpdateProfileInput = Partial<
  Pick<
    UserProfile,
    | "name"
    | "avatarUrl"
    | "avatarStorageKey"
    | "city"
    | "occupation"
    | "age"
    | "headline"
    | "bio"
    | "experienceSummary"
    | "experienceHighlights"
    | "educationHighlights"
    | "skills"
    | "interests"
    | "keywords"
    | "goals"
    | "preferredSessionModes"
    | "plan"
    | "cvDocument"
    | "documents"
  >
>;

type UpdateConsultantInput = Partial<
  Pick<
    ConsultantProfile,
    | "slug"
    | "name"
    | "headline"
    | "bio"
    | "experienceSummary"
    | "experienceHighlights"
    | "educationHighlights"
    | "city"
    | "experienceYears"
    | "priceBgn"
    | "featured"
    | "rating"
    | "reviewCount"
    | "nextAvailable"
    | "avatarUrl"
    | "heroUrl"
    | "avatarStorageKey"
    | "heroStorageKey"
    | "profileType"
    | "theme"
    | "idealFor"
    | "consultationTopics"
    | "workApproach"
    | "sessionLengthMinutes"
  >
> & {
  languages?: string[];
  specializations?: string[];
  sessionModes?: string[];
  tags?: string[];
  availability?: string[];
};

function requireBackend() {
  if (!isApiConfigured) {
    throw new Error("Backendът не е конфигуриран.");
  }
}

const REQUEST_TIMEOUT_MS = 15000;

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  requireBackend();

  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const externalSignal = options.signal;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch (value) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error("Сървърът не отговаря навреме. Опитай отново след малко.");
    }
    throw value;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text || "API request failed.";

    try {
      const parsed = JSON.parse(text) as { message?: string };
      message = parsed.message || message;
    } catch {}

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  async listConsultants(filters: { query?: string; city?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.query) params.set("query", filters.query);
    if (filters.city) params.set("city", filters.city);
    const queryString = params.toString();
    const demoConsultants = getFilteredDemoConsultants(filters);

    if (!isApiConfigured) {
      return demoConsultants;
    }

    try {
      const consultants = await request<ConsultantProfile[]>(
        `/consultants${queryString ? `?${queryString}` : ""}`
      );

      return mergeConsultantLists(consultants, demoConsultants);
    } catch (error) {
      if (demoConsultants.length) {
        return demoConsultants;
      }

      throw error;
    }
  },

  async getConsultant(slug: string) {
    const demoConsultant = getDemoConsultantBySlug(slug);

    if (demoConsultant) {
      return demoConsultant;
    }

    requireBackend();
    return request<ConsultantProfile>(`/consultants/${slug}`);
  },

  async bootstrapUser(token: string, input: BootstrapInput) {
    return request<UserProfile>(
      "/auth/bootstrap",
      { method: "POST", body: JSON.stringify(input) },
      token
    );
  },

  async getMyProfile(token: string) {
    return request<UserProfile>("/me/profile", undefined, token);
  },

  async updateMyProfile(token: string, input: UpdateProfileInput) {
    return request<UserProfile>(
      "/me/profile",
      { method: "PUT", body: JSON.stringify(input) },
      token
    );
  },

  async getMyConsultantProfile(token: string) {
    return request<ConsultantProfile>("/consultants/me", undefined, token);
  },

  async updateMyConsultantProfile(token: string, input: UpdateConsultantInput) {
    return request<ConsultantProfile>(
      "/consultants/me",
      { method: "PUT", body: JSON.stringify(input) },
      token
    );
  },

  async listBookings(token: string) {
    return request<Booking[]>("/bookings", undefined, token);
  },

  async createBooking(
    token: string,
    input: { consultantId: string; scheduledAt: string; note?: string }
  ) {
    return request<Booking>(
      "/bookings",
      { method: "POST", body: JSON.stringify(input) },
      token
    );
  },

  async cancelBooking(token: string, bookingId: string) {
    return request<Booking>(
      `/bookings/${encodeURIComponent(bookingId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) },
      token
    );
  },

  async createCvUpload(token: string, file: File) {
    const contentType = getCvUploadContentType(file);

    return request<{
      uploadUrl: string;
      storageKey: string;
      document: UploadedDocument;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          fileSize: file.size || 0
        })
      },
      token
    );
  },

  async createDocumentUpload(token: string, file: File) {
    const contentType = getDocumentUploadContentType(file);

    return request<{
      uploadUrl: string;
      storageKey: string;
      document: UploadedDocument;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          fileSize: file.size || 0,
          kind: "document"
        })
      },
      token
    );
  },

  async createConsultantMediaUpload(
    token: string,
    file: File,
    kind: ConsultantMediaKind
  ) {
    return request<{
      uploadUrl: string;
      storageKey: string;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size || 0,
          kind
        })
      },
      token
    );
  },

  async createUserAvatarUpload(token: string, file: File) {
    return request<{
      uploadUrl: string;
      storageKey: string;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size || 0,
          kind: "user-avatar"
        })
      },
      token
    );
  },

  async adminListConsultants(token: string) {
    return request<AdminConsultantSummary[]>(
      "/admin/consultants",
      undefined,
      token
    );
  },

  async adminGetConsultant(token: string, consultantId: string) {
    return request<AdminConsultantDetail>(
      `/admin/consultants/${encodeURIComponent(consultantId)}`,
      undefined,
      token
    );
  },

  async adminSetConsultantStatus(
    token: string,
    consultantId: string,
    status: ConsultantProfileStatus
  ) {
    return request<{
      consultantId: string;
      profileStatus: ConsultantProfileStatus;
      isPublic: boolean;
    }>(
      `/admin/consultants/${encodeURIComponent(consultantId)}/status`,
      { method: "PUT", body: JSON.stringify({ status }) },
      token
    );
  }
};
