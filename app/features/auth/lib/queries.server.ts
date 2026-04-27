import adminClient from "~/core/lib/supa-admin-client.server";

export async function doesUserExist(email: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("email_already_registered", {
    p_email: email,
  });

  if (error) {
    throw new Error(`Failed to check email existence: ${error.message}`);
  }

  return data ?? false;
}
