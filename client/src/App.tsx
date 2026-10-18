import { Switch, Route, useLocation } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import { AdminProvider } from "@/contexts/admin";
import Home from "@/pages/Home";
import CategoryPage from "@/pages/CategoryPage";
import PostDetail from "@/pages/PostDetail";
import Schedule from "@/pages/Schedule";
import AcceptInvite from "@/pages/AcceptInvite";
import Privacy from "@/pages/Privacy";
import NotFound from "@/pages/not-found";
import { PopupDisplay } from "@/components/PopupDisplay";
import { useCategories } from "@/hooks/use-categories";

/**
 * TV 화면은 **지연 로딩**한다. 켜 두는 화면이라 처음 한 번 더 기다리는 것은
 * 상관없고, 대신 메인 번들에서 TV 코드와 QR 라이브러리가 빠진다.
 */
const TvPage = lazy(() => import("@/pages/TvPage"));

function Router() {
  // 푸터의 "주요메뉴" 가 쓴다. 숨긴 게시판은 저절로 빠진다.
  const { visible, routeOf } = useCategories();

  return (
    <div className="flex flex-col min-h-screen">
      <Navigation />
      <main className="flex-grow">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/lab">
            {() => <CategoryPage categoryId="lab_intro" />}
          </Route>
          <Route path="/class">
            {() => <CategoryPage categoryId="science_class" />}
          </Route>
          <Route path="/career">
            {() => <CategoryPage categoryId="career_program" />}
          </Route>
          <Route path="/student">
            {() => <CategoryPage categoryId="student_program" />}
          </Route>
          <Route path="/community">
            {() => <CategoryPage categoryId="local_community" />}
          </Route>
          <Route path="/schedule" component={Schedule} />
          <Route path="/posts/:id" component={PostDetail} />
          {/* 교사 초대 링크. 토큰은 SPA 라우팅으로만 다루므로 서버 로그에 남지 않는다. */}
          <Route path="/invite/:token" component={AcceptInvite} />
          <Route path="/privacy" component={Privacy} />
          <Route component={NotFound} />
        </Switch>
      </main>
      
      {/* Footer */}
      <footer className="bg-foreground text-muted border-t border-white/10 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-black text-white mb-4 tracking-tight">미사강변고등학교 과학중점고</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                경기도 하남시 미사강변동로 000<br />
                미래를 선도하는 창의융합 인재 육성의 산실
              </p>
            </div>
            <div className="flex gap-8 md:justify-end">
              <div className="space-y-3">
                <h4 className="text-white font-bold text-sm uppercase tracking-wider">주요메뉴</h4>
                {/* 하드코딩이던 세 줄을 목록에서 만든다. 전에는 여기 "진로프로그램" 이
                    메뉴의 "창의융합진로프로그램" 과 **이미 달랐다.** 숨긴 게시판도
                    자동으로 빠진다. */}
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {visible.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      <a href={routeOf(c.id)} className="hover:text-white transition-colors">
                        {c.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="text-white font-bold text-sm uppercase tracking-wider">연락처</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>교무실: 031-000-0000</li>
                  <li>행정실: 031-000-0000</li>
                  <li>팩스: 031-000-0000</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-12 pt-8 text-center text-sm text-muted-foreground space-y-3">
            {/* 개인정보처리방침은 눈에 띄어야 한다. 학생 정보를 받는 사이트다. */}
            <a href="/privacy" className="inline-block font-semibold text-white hover:underline">
              개인정보처리방침
            </a>
            <div>
              © {new Date().getFullYear()} Misa Gangbyeon High School Science Focus. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * `/tv` 를 **가장 먼저 가른다.**
 *
 * 헤더·푸터가 `Router()` 안에서 모든 라우트를 감싸고, `Toaster`·`PopupDisplay` 는
 * 그 바깥에 있다. `Switch` 안에 `/tv` 를 넣으면 **헤더·푸터·팝업·알림이 다 따라
 * 온다.** TV 는 사람이 조작하지 않는 화면이라 그것들이 있으면 안 된다.
 *
 * **그 외 경로에서는 트리가 글자 하나 다르지 않다** — 아래 `else` 쪽이 바꾸기 전과
 * 같은 세 줄이다.
 */
function Shell() {
  const [location] = useLocation();
  // 쿼리스트링은 `location` 에 들어오지 않는다. `/tv?news=10` 도 여기서 걸린다.
  if (location === "/tv") {
    return (
      <Suspense fallback={<div className="min-h-screen" style={{ background: "#0b1730" }} />}>
        <TvPage />
      </Suspense>
    );
  }
  return (
    <>
      <Toaster />
      <PopupDisplay />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AdminProvider>
          <Shell />
        </AdminProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
