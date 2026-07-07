import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 配置文件路径
const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

// 默认配置
const DEFAULT_CONFIG = {
  wechat: {
    enabled: true,
    title: '添加微信',
    description: '扫码添加微信，获取更多资讯',
    qrcodeUrl: '',
    wechatId: '',
    buttonText: '立即添加',
    popupDelay: 3000, // 弹窗延迟（毫秒）
    showOnFirstVisit: true,
  },
  links: [
    {
      id: 'link1',
      title: '官方公众号',
      url: '',
      icon: 'megaphone',
      position: 'sidebar', // sidebar | header | footer | popup
      enabled: true,
      order: 1,
    },
    {
      id: 'link2',
      title: '在线咨询',
      url: '',
      icon: 'message-circle',
      position: 'sidebar',
      enabled: true,
      order: 2,
    },
    {
      id: 'link3',
      title: '查看更多',
      url: '',
      icon: 'external-link',
      position: 'header',
      enabled: true,
      order: 3,
    },
  ],
};

// 确保数据目录存在
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// 读取配置
function readConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

// 写入配置
function writeConfig(config: typeof DEFAULT_CONFIG) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// 获取配置
export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[Config] Read error:', error);
    return NextResponse.json(
      { success: false, message: '读取配置失败' },
      { status: 500 }
    );
  }
}

// 更新配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = readConfig();
    
    // 合并更新
    const updatedConfig = {
      ...config,
      ...body,
      wechat: body.wechat ? { ...config.wechat, ...body.wechat } : config.wechat,
      links: body.links || config.links,
    };

    writeConfig(updatedConfig);
    
    return NextResponse.json({ 
      success: true, 
      message: '配置更新成功',
      config: updatedConfig 
    });
  } catch (error) {
    console.error('[Config] Update error:', error);
    return NextResponse.json(
      { success: false, message: '更新配置失败' },
      { status: 500 }
    );
  }
}
