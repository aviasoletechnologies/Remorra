import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class StorageService {
  private readonly client: SupabaseClient;
  readonly bucket = process.env.SUPABASE_PRIVATE_BUCKET ?? "private-documents";

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    }
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
  }

  async signedUrl(path: string, expiresIn = 900) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  }

  async remove(paths: string[]) {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) throw error;
  }
}
