#!/usr/bin/env python3
"""
设置管理员角色的命令行工具
用法: python set_admin.py --username <用户名>
"""

import argparse
from database import db


def main():
    parser = argparse.ArgumentParser(description='设置用户为管理员')
    parser.add_argument('--username', required=True, help='要设置为管理员的用户名')
    parser.add_argument('--remove', action='store_true', help='移除管理员权限（降为普通用户）')
    args = parser.parse_args()
    
    user = db.get_user_by_username(args.username)
    if not user:
        print(f"错误: 用户 '{args.username}' 不存在")
        return
    
    new_role = 'user' if args.remove else 'admin'
    success = db.update_user_role(user['id'], new_role)
    
    if success:
        if args.remove:
            print(f"已将用户 '{args.username}' 的权限降为普通用户")
        else:
            print(f"已将用户 '{args.username}' 设置为管理员")
    else:
        print(f"操作失败，请检查数据库")


if __name__ == '__main__':
    main()
