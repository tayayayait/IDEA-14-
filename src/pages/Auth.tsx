import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSessionOrRecover } from "@/lib/supabase-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { Compass, Loader2 } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate("/projects", { replace: true });
    });
    getSessionOrRecover()
      .then((session) => {
        if (session) navigate("/projects", { replace: true });
      })
      .catch(() => undefined);
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/projects",
            data: { display_name: displayName, organization },
          },
        });
        if (error) throw error;
        toast.success("가입이 시작되었습니다. 메일함을 확인해 주세요.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-2 px-6 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
          <Compass className="h-5 w-5" />
        </span>
        <span className="font-display text-base font-semibold">산단수출 코파일럿</span>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-md items-center px-6">
        <Card className="w-full shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display text-2xl">시작하기</CardTitle>
            <CardDescription>
              5분 안에 어디로·어떻게 수출을 시작할지 1페이지 리포트로 받아보세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">로그인</TabsTrigger>
                <TabsTrigger value="signup">회원가입</TabsTrigger>
              </TabsList>
              <form onSubmit={onSubmit} className="mt-4 space-y-4">
                {tab === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="name">이름</Label>
                      <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="홍길동" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org">소속(선택)</Label>
                      <Input id="org" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="OO 산업단지 / OO 무역" />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">이메일</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw">비밀번호</Label>
                  <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                    autoComplete={tab === "signup" ? "new-password" : "current-password"} />
                </div>
                <TabsContent value="signin" className="mt-0" />
                <TabsContent value="signup" className="mt-0" />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {tab === "signup" ? "가입하기" : "로그인"}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

