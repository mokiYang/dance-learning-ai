# 账号系统说明文档

## 🎯 功能概述

为舞蹈学习AI系统添加了完整的账号认证体系，实现了以下功能：

### 权限控制
- **未登录用户**：只能浏览视频列表
- **已登录用户**：可以上传视频、跟学练习、评论互动等

### 页面结构
- **首页（/）**：视频列表页面，所有人可见
- **视频播放页（/video/:id）**：视频详情和跟学功能
- **个人页（/profile）**：登录/注销、个人信息管理
- **底部Tab导航**：首页 + 个人页

---

## 🔐 技术实现

### 后端（Python + Flask）

#### 1. 数据库表结构

**用户表 (users)**
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
```

**会话表 (user_sessions)**
```sql
CREATE TABLE user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

#### 2. 认证API接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/logout` | POST | 用户注销（需要认证） |
| `/api/auth/current-user` | GET | 获取当前用户信息（需要认证） |

#### 3. Token策略

- **类型**：JWT (JSON Web Token)
- **有效期**：365天（接近永久）
- **算法**：HS256
- **存储**：前端localStorage + 后端数据库

#### 4. 受保护的接口

以下接口需要登录后才能访问：
- `POST /api/upload-reference` - 上传参考视频
- `POST /api/upload-user-video` - 上传用户视频

---

### 前端（React + TypeScript）

#### 1. 新增组件

- **`AuthContext`** - 认证状态管理（React Context API）
- **`TabBar`** - 底部导航栏组件
- **`Profile`** - 个人页面组件
- **`Login`** - 登录/注册组件

#### 2. 权限控制

**VideoList组件**
- 未登录：显示"登录后可上传视频"按钮
- 已登录：显示"上传视频"按钮

**VideoPlayer组件**
- 未登录：显示"登录后可跟学"按钮
- 已登录：显示"跟学"按钮

#### 3. API请求拦截

所有API请求自动携带Token：
```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

处理401未授权错误：
- 自动清除本地Token
- 跳转到登录页面

---

## 📝 使用指南

### 用户注册

1. 访问个人页（点击底部Tab "个人"）
2. 点击"立即注册"
3. 输入用户名（至少3个字符）
4. 输入密码（至少6个字符）
5. 可选：输入邮箱
6. 点击"注册"按钮
7. 注册成功后自动登录

### 用户登录

1. 访问个人页
2. 输入用户名和密码
3. 点击"登录"按钮
4. 登录成功后跳转到个人页

### 用户注销

1. 访问个人页
2. 点击"退出登录"按钮
3. 确认后注销，返回登录页

### 上传视频（需要登录）

1. 确保已登录
2. 在首页点击"上传视频"按钮
3. 选择视频文件
4. 填写标题、作者、描述等信息
5. 点击上传

### 跟学练习（需要登录）

1. 确保已登录
2. 点击视频进入播放页
3. 点击"跟学"按钮
4. 允许摄像头权限
5. 系统自动倒计时并开始录制

---

## 🔒 安全特性

### 密码安全
- 使用 `werkzeug.security` 进行密码哈希
- 密码哈希算法：PBKDF2
- 不存储明文密码

### Token安全
- Token包含用户ID和用户名
- Token设置过期时间（365天）
- Token使用HS256算法签名
- 后端验证Token有效性

### 请求安全
- 敏感API添加认证装饰器 `@require_auth`
- 前端自动携带Token
- 401错误自动处理

---

## 🚀 部署说明

### 后端部署

1. 安装依赖：
```bash
cd backend
pip install -r requirements.txt
```

2. 设置环境变量（可选）：
```bash
export SECRET_KEY="your-secret-key-change-in-production"
```

3. 启动服务：
```bash
python app.py
```

### 前端部署

前端代码已集成，无需额外配置。

---

## 📊 数据库迁移

系统会自动创建用户表和会话表，无需手动迁移。

首次启动后端服务时，`database.py` 会自动执行 `init_database()` 方法创建所需的表。

---

## 🛠️ 开发指南

### 添加新的受保护接口

```python
@app.route('/api/your-endpoint', methods=['POST'])
@require_auth
def your_endpoint():
    # 获取当前用户信息
    user_id = request.current_user['user_id']
    username = request.current_user['username']
    
    # 你的业务逻辑
    ...
```

### 前端使用认证信息

```typescript
import { useAuth } from '../contexts/AuthContext';

const YourComponent = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  
  // 检查是否登录
  if (!isAuthenticated) {
    return <div>请先登录</div>;
  }
  
  // 使用用户信息
  return <div>欢迎，{user?.username}</div>;
};
```

---

## 🔄 后续升级建议

### 第一阶段：当前实现（永久Token）
- ✅ Token有效期365天
- ✅ 简单易用
- ✅ 快速开发

### 第二阶段：中期Token（建议30天后升级）
- Token有效期30天
- 提高安全性

### 第三阶段：短期Token + 刷新Token（生产环境）
- Access Token：15分钟
- Refresh Token：7天
- 自动刷新机制
- 最高安全性

---

## 📞 技术支持

如有问题，请查看：
1. 后端日志：查看 `backend/` 目录下的日志
2. 前端控制台：浏览器开发者工具
3. 数据库：`backend/dance_learning.db`

---

## 更新日志

### 2025-01-30
- ✅ 添加用户认证系统
- ✅ 实现登录/注册功能
- ✅ 添加底部Tab导航
- ✅ 实现权限控制
- ✅ 保护上传和跟学功能
- ✅ Token自动携带和验证
