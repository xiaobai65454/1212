import { NextRequest, NextResponse } from 'next/server';

// 管理员账号配置（生产环境请使用环境变量）
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'xiaobaibai2024';

// 固定的 session token（生产环境建议使用 JWT 或数据库存储）
const SESSION_TOKEN = process.env.SESSION_SECRET || 'xbb_fixed_session_token_2024';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: '请输入账号和密码' },
        { status: 400 }
      );
    }

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // 设置 cookie 作为 session
      const response = NextResponse.json({
        success: true,
        message: '登录成功',
        user: { username, role: 'admin' }
      });

      response.cookies.set('xbb_session', SESSION_TOKEN, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24小时
        path: '/',
      });

      return response;
    }

    return NextResponse.json(
      { success: false, message: '账号或密码错误' },
      { status: 401 }
    );
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json(
      { success: false, message: '登录失败' },
      { status: 500 }
    );
  }
}

// 验证登录状态
export async function GET(request: NextRequest) {
  const session = request.cookies.get('xbb_session');
  
  if (session && session.value === SESSION_TOKEN) {
    return NextResponse.json({ 
      success: true, 
      loggedIn: true,
      user: { username: ADMIN_USERNAME, role: 'admin' }
    });
  }

  return NextResponse.json({ 
    success: true, 
    loggedIn: false 
  });
}

// 退出登录
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: '已退出登录' });
  
  response.cookies.set('xbb_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}
