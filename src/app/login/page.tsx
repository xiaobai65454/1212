'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Loader2, 
  AlertCircle,
  MessageSquare
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  // 检查是否已登录
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/login', { credentials: 'include' });
        const data = await res.json();
        if (data.loggedIn) {
          router.push('/knowledge');
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setChecking(false);
      }
    };
    checkAuth();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      const data = await res.json();

      if (data.success) {
        router.push('/knowledge');
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FF6B4A]/5 via-[#F5F0EB] to-[#4ECDC4]/5">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF6B4A]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FF6B4A]/5 via-[#F5F0EB] to-[#4ECDC4]/5 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B4A] to-[#FF8F73] shadow-lg shadow-[#FF6B4A]/20 mb-4">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">小白白管理后台</h1>
          <p className="text-[#1A1A2E]/50 mt-2">请登录以管理知识库</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#1A1A2E]/5 p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-[#1A1A2E]/70 mb-2">
                账号
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#1A1A2E]/30" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入管理员账号"
                  className="w-full pl-12 pr-4 py-3.5 bg-[#F5F0EB]/50 border border-[#1A1A2E]/5 rounded-xl text-[#1A1A2E] placeholder:text-[#1A1A2E]/30 focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/20 focus:border-[#FF6B4A]/30 transition-all"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#1A1A2E]/70 mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#1A1A2E]/30" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full pl-12 pr-12 py-3.5 bg-[#F5F0EB]/50 border border-[#1A1A2E]/5 rounded-xl text-[#1A1A2E] placeholder:text-[#1A1A2E]/30 focus:outline-none focus:ring-2 focus:ring-[#FF6B4A]/20 focus:border-[#FF6B4A]/30 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#1A1A2E]/30 hover:text-[#1A1A2E]/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#FF6B4A] to-[#FF8F73] text-white font-medium rounded-xl hover:shadow-lg hover:shadow-[#FF6B4A]/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <span>登录</span>
              )}
            </button>
          </form>

          {/* Hint */}
          <div className="mt-6 pt-6 border-t border-[#1A1A2E]/5">
            <p className="text-xs text-[#1A1A2E]/40 text-center">
              默认账号：admin / 默认密码：xiaobaibai2024
            </p>
          </div>
        </div>

        {/* Back to chat */}
        <div className="text-center mt-6">
          <Link 
            href="/" 
            className="text-sm text-[#1A1A2E]/40 hover:text-[#FF6B4A] transition-colors"
          >
            返回对话页面
          </Link>
        </div>
      </div>
    </div>
  );
}
