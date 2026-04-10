---
name: anyrobot-shadcn-frontend-js
description: >
  AnyRobot 前端开发核心指南：提供 JavaScript + React + shadcn/ui 开发的精简实用规范和最佳实践。
  当用户需要前端开发指导、组件开发或项目结构建议时触发。
  本技能提供实际可用于项目开发的核心代码示例和开发指南。
version: "1.0.0"
guidelines: >
  本技能提供的代码示例和实践建议均经过验证，可直接应用于实际项目开发中。
  遵循这些最佳实践可以提高代码质量、可维护性和性能。
---

# AnyRobot 前端开发核心指南

本技能提供了一套现代化的前端开发核心规范和最佳实践，涵盖 JavaScript、React、Tailwind CSS 和 shadcn/ui 等技术栈。

> **适用场景**：新项目初始化、现有项目优化、代码审查参考、团队开发规范制定。

---

## ✨ 核心价值

```
✅ 推荐的最佳实践：
- 使用 const/let 而非 var
- 遵循组件化开发原则，合理拆分组件
- 采用 Tailwind CSS 进行样式管理
- 集成 shadcn/ui 构建一致的 UI 组件库
- 注重性能优化和安全实践
- 保持代码风格一致，添加必要注释
- 建立清晰的项目文件结构
- 完善错误处理和边界情况
```

---

## 目录导航

- [项目结构与文件组织](#项目结构与文件组织)
- [React 开发最佳实践](#react-开发最佳实践)
- [shadcn/ui 组件使用](#shadcnui-组件使用)
- [Tailwind CSS 最佳实践](#tailwind-css-最佳实践)
- [性能优化策略](#性能优化策略)
- [安全开发实践](#安全开发实践)
- [实用工具与技巧](#实用工具与技巧)

---

# 项目结构与文件组织

## 推荐的项目结构

```
/src
  /components
    /ui               # shadcn/ui 组件
      button.jsx
      input.jsx
      card.jsx
    /layout           # 布局组件
      Header.jsx
      Sidebar.jsx
      Footer.jsx
    /feature          # 功能组件
      UserList.jsx
      UserForm.jsx
  /hooks             # 自定义 Hooks
    useAuth.js
    useApi.js
  /utils             # 工具函数
    formatters.js
    api.js
  /pages             # 页面组件
    /home            # 首页模块
      index.jsx
      components/     # 首页子组件
        Hero.jsx
        Features.jsx
    /auth            # 认证模块
      index.jsx
      components/     # 认证子组件
        LoginForm.jsx
    /dashboard       # 仪表盘模块
      index.jsx
      components/     # 仪表盘子组件
        StatsCard.jsx
  /context           # React 上下文
    AuthContext.jsx
  /locales           # 国际化资源
    /en-US           # 英语（美国）
      index.js
      common.js
      dashboard.js
    /zh-CN           # 中文（简体）
      index.js
      common.js
      dashboard.js
  /styles            # 全局样式
    globals.css
  App.jsx            # 应用根组件
  main.jsx           # 应用入口
  i18n.js            # 国际化配置
```

## 命名规范

- **组件文件**：使用 PascalCase，如 `UserList.jsx`
- **工具函数**：使用 camelCase，如 `formatDate.js`
- **目录名**：使用 kebab-case，如 `feature-components`
- **变量和函数**：使用 camelCase
- **常量**：使用 UPPER_SNAKE_CASE
- **国际化文件**：
  - 语言目录：使用语言代码，如 `en-US`、`zh-CN`
  - 资源文件：使用 camelCase，如 `common.js`、`dashboard.js`
  - 键名：使用点号分隔的命名空间，如 `common.hello`、`dashboard.title`

## 文件组织原则

1. **按功能模块组织**：将相关功能的组件、hooks、utils 放在一起
2. **单一职责**：每个文件只负责一个功能
3. **可复用性**：将通用组件和工具函数抽离出来
4. **pages 目录组织**：按功能模块以文件夹形式存放，每个模块内部再进行组件拆分

---

# React 开发最佳实践

## 1. 函数组件与 Hooks

```jsx
// ✅ 推荐：使用函数组件和 Hooks
import { useState, useEffect } from "react";

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      try {
        const data = await getUserById(userId);
        setUser(data);
      } catch (err) {
        setError("Failed to fetch user");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}
```

## 2. 自定义 Hooks

```jsx
// ✅ 推荐：封装重复逻辑到自定义 Hooks
import { useState, useEffect } from "react";

function useApi(url, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url, ...dependencies]);

  return { data, loading, error };
}

// 使用
function UserList() {
  const { data: users, loading, error } = useApi("/api/users");

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {users?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

## 3. 状态管理

```jsx
// ✅ 推荐：使用 React Context 进行轻量级状态管理
import { createContext, useContext, useState } from "react";

const AuthContext = createContext(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error("Login failed");

      const data = await response.json();
      setUser(data.user);
      localStorage.setItem("token", data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

# shadcn/ui 组件使用

## 1. 组件安装与配置

```bash
# 安装 shadcn/ui
npx shadcn-ui@latest init

# 添加组件
npx shadcn-ui@latest add button input card
```

## 2. 基础组件使用

```jsx
// ✅ 推荐：使用 shadcn/ui 组件
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function LoginForm() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to your account</CardTitle>
        <CardDescription>
          Enter your email and password to access your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email">Email</label>
            <Input id="email" type="email" placeholder="name@example.com" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password">Password</label>
            <Input id="password" type="password" placeholder="••••••••" />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Sign in</Button>
      </CardFooter>
    </Card>
  );
}
```

## 3. 组件定制

```jsx
// ✅ 推荐：定制 shadcn/ui 组件
import { Button } from "@/components/ui/button";

// 主按钮
const PrimaryButton = ({ children, ...props }) => (
  <Button className="bg-primary hover:bg-primary/90 text-white" {...props}>
    {children}
  </Button>
);

// 次要按钮
const SecondaryButton = ({ children, ...props }) => (
  <Button
    className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
    {...props}
  >
    {children}
  </Button>
);

// 使用
function ActionButtons() {
  return (
    <div className="flex space-x-2">
      <PrimaryButton>Save</PrimaryButton>
      <SecondaryButton>Cancel</SecondaryButton>
    </div>
  );
}
```

---

# Tailwind CSS 最佳实践

## 1. 类名组织

```jsx
// ✅ 推荐：按逻辑顺序组织类名
<div
  className="
  relative                    {/* 1. 定位 */}
  w-full max-w-4xl            {/* 2. 尺寸 */}
  mx-auto p-6                 {/* 3. 布局 */}
  bg-white dark:bg-gray-900   {/* 4. 背景 */}
  text-gray-900 dark:text-gray-100 {/* 5. 文字 */}
  rounded-lg shadow-md        {/* 6. 效果 */}
  transition-all duration-300 {/* 7. 过渡 */}
  hover:shadow-lg             {/* 8. 交互 */}
"
>
  Content here
</div>
```

## 2. 响应式设计

```jsx
// ✅ 推荐：使用响应式断点
<div
  className="
  grid 
  grid-cols-1      /* 移动端 */
  md:grid-cols-2   /* 平板 */
  lg:grid-cols-4   /* 桌面 */
  gap-4 md:gap-6
  p-4 md:p-6
"
>
  {items.map((item) => (
    <Card key={item.id}>{/* 卡片内容 */}</Card>
  ))}
</div>
```

## 3. 暗色模式

```jsx
// ✅ 推荐：支持暗色模式
<div
  className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-gray-100
  border border-gray-200 dark:border-gray-700
  rounded-md
  p-4
"
>
  <h3 className="font-medium mb-2">Card Title</h3>
  <p className="text-sm text-gray-600 dark:text-gray-400">
    Card description goes here
  </p>
</div>
```

---

# 性能优化策略

## 1. 组件优化

```jsx
// ✅ 推荐：使用 React.memo 避免不必要的重渲染
import { memo } from "react";

const UserCard = memo(({ user, onEdit }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <button onClick={() => onEdit(user.id)}>Edit</button>
    </div>
  );
});

// ✅ 推荐：使用 useCallback 缓存函数
import { useCallback } from "react";

function UserList({ users }) {
  const handleEdit = useCallback((id) => {
    console.log("Edit user:", id);
  }, []);

  return (
    <div className="user-list">
      {users.map((user) => (
        <UserCard key={user.id} user={user} onEdit={handleEdit} />
      ))}
    </div>
  );
}
```

## 2. 状态优化

```jsx
// ✅ 推荐：使用 useMemo 缓存计算结果
import { useMemo } from "react";

function ExpensiveComponent({ items }) {
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const totalPrice = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price, 0);
  }, [items]);

  return (
    <div>
      <h2>Total: ${totalPrice.toFixed(2)}</h2>
      <ul>
        {sortedItems.map((item) => (
          <li key={item.id}>
            {item.name} - ${item.price}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

# 安全开发实践

## 1. XSS 防护

```jsx
// ✅ 推荐：使用 React 自动转义
function UserComment({ comment }) {
  // React 会自动转义 HTML 内容
  return <div className="comment">{comment}</div>;
}

// ✅ 推荐：使用 DOMPurify 处理富文本
import DOMPurify from "dompurify";

function RichTextContent({ html }) {
  const sanitizedHtml = DOMPurify.sanitize(html);
  return (
    <div
      className="rich-text"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
```

## 2. 敏感信息处理

```jsx
// ✅ 推荐：使用环境变量存储敏感信息
// .env.local
// API_KEY=your_api_key

// 使用
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

// ✅ 推荐：使用 httpOnly Cookie 存储认证信息
// 登录时
fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
  credentials: "include", // 包含 cookies
});

// 验证时
fetch("/api/protected", {
  credentials: "include", // 包含 cookies
});
```

## 3. 输入验证

```jsx
// ✅ 推荐：使用 Zod 进行表单验证
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function RegisterForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();

    const result = userSchema.safeParse(formData);
    if (!result.success) {
      setErrors(result.error);
      return;
    }

    // 提交表单
    console.log("Valid form data:", result.data);
  };

  // 表单 JSX
}
```

---

# 实用工具与技巧

## 1. 常用工具函数

```jsx
// ✅ 推荐：封装常用工具函数

// 日期格式化
export function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

// 数字格式化
export function formatNumber(num) {
  return new Intl.NumberFormat("zh-CN").format(num);
}

// 错误处理
export function handleError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
```

## 2. 开发工具

- **ESLint & Prettier**：代码风格检查和格式化
- **Husky**：Git 钩子，确保提交前代码质量
- **Vitest**：单元测试
- **Playwright**：端到端测试

## 3. 调试技巧

```jsx
// ✅ 推荐：使用 React DevTools 进行调试
// 安装：Chrome 扩展商店搜索 "React DevTools"

// ✅ 推荐：使用 console.group 组织日志
function complexFunction() {
  console.group("Complex Function");
  console.log("Step 1: Initializing");
  // 代码逻辑
  console.log("Step 2: Processing");
  // 代码逻辑
  console.log("Step 3: Completed");
  console.groupEnd();
}

// ✅ 推荐：使用断点调试
function buggyFunction() {
  // 在 VS Code 中点击行号设置断点
  const result = someCalculation();
  return result;
}
```

---

# 总结

| 最佳实践     | 说明                               |
| ------------ | ---------------------------------- |
| 组件化开发   | 合理拆分组件，保持单一职责         |
| shadcn/ui    | 构建一致的 UI 组件库               |
| Tailwind CSS | 高效的样式管理                     |
| 性能优化     | 使用 memo、useCallback、useMemo 等 |
| 安全实践     | 防止 XSS、保护敏感信息             |
| 代码规范     | 统一的命名和文件组织               |
| 工具链       | 使用现代开发工具提升效率           |

> **记住**：好的代码是可维护、可扩展、可测试的。遵循这些最佳实践，让你的前端项目更加专业和可靠！
