import { type NextRequest, NextResponse } from "next/server"


export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  const accessToken =
    request.cookies.get("access_token")?.value ||
    request.cookies.get("accessToken")?.value
  const adminToken = request.cookies.get("admin_token")?.value


  const isAdminRoute =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/auth")
  const isUserProtectedRoute = pathname.startsWith("/dashboard")

  // Admin route guard
  if (isAdminRoute && !adminToken) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/auth/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // User route guard
  if (isUserProtectedRoute && !accessToken) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Avoid auth pages when already logged in
  if (accessToken && pathname.startsWith("/auth/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  if (adminToken && pathname.startsWith("/admin/auth/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/dashboard"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public).*)"],
}
