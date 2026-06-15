import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { supabase } from "../lib/supabase";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  async function update() {
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) return setMessage(error.message);
    navigate("/");
  }
  return <main className="configuration-page"><Card className="auth-card"><h1>Choose a new password</h1><label>New password<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="form-message">{message}</p>}<Button disabled={password.length < 8} onClick={() => void update()}>Update password</Button></Card></main>;
}
