import { createServerClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).single();

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-bold text-burgundy-dark">Your profile</h1>
      {profile && <ProfileForm profile={profile} />}
    </div>
  );
}
