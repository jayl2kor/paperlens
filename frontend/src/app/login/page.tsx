"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, register, isAuthenticated } from "@/lib/auth";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) router.replace("/");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      router.push("/");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(
        axiosErr.response?.data?.detail ||
          (mode === "login"
            ? "로그인에 실패했습니다."
            : "회원가입에 실패했습니다.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">Paper Insight</h1>
        <p className="text-foreground/50 text-center text-sm mb-8">
          AI 기반 논문 리딩 도구
        </p>

        {/* Mode tabs */}
        <div className="flex mb-6 border-b border-foreground/10">
          <button
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 pb-2.5 text-sm font-medium transition-colors ${
              mode === "login"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
                : "text-foreground/40 hover:text-foreground/60"
            }`}
          >
            로그인
          </button>
          <button
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 pb-2.5 text-sm font-medium transition-colors ${
              mode === "register"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
                : "text-foreground/40 hover:text-foreground/60"
            }`}
          >
            회원가입
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-sm font-medium mb-1">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-foreground/15 bg-foreground/[0.03] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                placeholder="이름"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-foreground/15 bg-foreground/[0.03] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 rounded-lg border border-foreground/15 bg-foreground/[0.03] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
              placeholder={
                mode === "register" ? "6자 이상" : "비밀번호"
              }
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading
              ? "처리 중..."
              : mode === "login"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>
      </div>
    </div>
  );
}
