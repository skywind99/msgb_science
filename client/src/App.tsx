import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import Home from "@/pages/Home";
import CategoryPage from "@/pages/CategoryPage";
import PostDetail from "@/pages/PostDetail";
import NotFound from "@/pages/not-found";

function Router() {
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
          <Route path="/posts/:id" component={PostDetail} />
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
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="/lab" className="hover:text-white transition-colors">과학실 소개</a></li>
                  <li><a href="/class" className="hover:text-white transition-colors">과학중점반활동</a></li>
                  <li><a href="/career" className="hover:text-white transition-colors">진로프로그램</a></li>
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
          <div className="border-t border-white/10 mt-12 pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Misa Gangbyeon High School Science Focus. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
