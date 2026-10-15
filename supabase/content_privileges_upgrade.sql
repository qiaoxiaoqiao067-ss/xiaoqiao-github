-- API 上传收稿使用 service_role，补齐内容相关表的数据库权限。
grant select, insert, update, delete on table
  public.contents,
  public.content_files,
  public.content_reviews
to service_role;
