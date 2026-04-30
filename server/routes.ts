import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { api } from "../shared/routes.js";
import { z } from "zod";

declare const process: { env: Record<string, string | undefined> };

// 사이언스타임즈 기사 캐시 (1시간)
let scienceNewsCache: { data: ScienceNewsItem; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

interface ScienceNewsItem {
  title: string;
  summary: string;
  imageUrl: string | null;
  link: string;
  date: string;
  series: string;
}

async function fetchScienceNews(): Promise<ScienceNewsItem> {
  const now = Date.now();
  if (scienceNewsCache && now - scienceNewsCache.fetchedAt < CACHE_TTL) {
    return scienceNewsCache.data;
  }

  const res = await fetch(
    "https://www.sciencetimes.co.kr/nscvrg/list/menu/265?sersYn=Y",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; school-site/1.0)" } }
  );
  const html = await res.text();

  // 첫 번째 기사 파싱
  const articleMatch = html.match(
    /class="sel_left"[\s\S]*?<article[\s\S]*?<\/article>/
  );
  const block = articleMatch ? articleMatch[0] : html;

  // 시리즈명
  const seriesMatch = block.match(/class="[^"]*series[^"]*"[^>]*>([^<]+)<\/a>/i)
    || block.match(/<dt[^>]*>([\uAC00-\uD7A3\w\s·\-]+)<\/dt>/u);
  const series = seriesMatch ? seriesMatch[1].trim() : "기획·칼럼";

  // 제목
  const titleMatch = block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
    : "사이언스타임즈 최신 기사";

  // 요약
  const summaryMatch = block.match(
    /nscvrgSn=\d+"[^>]*>([\s\S]*?)<\/a>/
  );
  let summary = "";
  if (summaryMatch) {
    const raw = summaryMatch[1].replace(/<[^>]+>/g, " ").trim();
    const lines = raw.split(/\n/).map((l: string) => l.trim()).filter(Boolean);
    summary = lines.slice(-1)[0] || lines[0] || "";
    if (summary.length > 120) summary = summary.slice(0, 120) + "…";
  }

  // 이미지
  const imgMatch = block.match(/jnrepo\/upload\/[^"']+\.(jpg|jpeg|png|gif|webp)/i);
  const imageUrl = imgMatch
    ? "https://www.sciencetimes.co.kr/" + imgMatch[0]
    : null;

  // 링크
  const linkMatch = block.match(/href="(https:\/\/www\.sciencetimes\.co\.kr\/nscvrg\/view\/[^"]+)"/);
  const link = linkMatch ? linkMatch[1] : "https://www.sciencetimes.co.kr/nscvrg/list/menu/265?sersYn=Y";

  // 날짜
  const dateMatch = block.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : "";

  const data: ScienceNewsItem = { title, summary, imageUrl, link, date, series };
  scienceNewsCache = { data, fetchedAt: now };
  return data;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get(api.posts.list.path, async (req, res) => {
    const category = req.query.category as string | undefined;
    const postsList = await storage.getPosts(category);
    res.json(postsList);
  });

  app.get(api.posts.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    const post = await storage.getPost(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(post);
  });

  // ── 사이언스타임즈 최신 기사 ──────────────────────────
  app.get("/api/science-news", async (_req, res) => {
    try {
      const news = await fetchScienceNews();
      res.json(news);
    } catch (err) {
      console.error("science-news fetch error:", err);
      res.status(500).json({ message: "기사를 불러올 수 없습니다." });
    }
  });

  const checkAdminPassword = (req: any, res: any): boolean => {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const provided = req.headers["x-admin-password"] as string | undefined;
    if (!adminPassword || provided !== adminPassword) {
      res.status(401).json({ message: "관리자 비밀번호가 올바르지 않습니다." });
      return false;
    }
    return true;
  };

  app.post("/api/admin/verify", (req, res) => {
    if (checkAdminPassword(req, res)) {
      res.json({ ok: true });
    }
  });

  app.post(api.posts.create.path, async (req, res) => {
    if (!checkAdminPassword(req, res)) return;
    try {
      const input = api.posts.create.input.parse(req.body);
      const post = await storage.createPost(input);
      res.status(201).json(post);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.patch(api.posts.update.path, async (req, res) => {
    if (!checkAdminPassword(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
      const input = api.posts.update.input.parse(req.body);
      const post = await storage.updatePost(id, input);
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json(post);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.delete(api.posts.delete.path, async (req, res) => {
    if (!checkAdminPassword(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    const success = await storage.deletePost(id);
    if (!success) return res.status(404).json({ message: "Post not found" });
    res.status(204).end();
  });

  // Seed data
  try {
    const existingPosts = await storage.getPosts();
    if (existingPosts.length === 0) {
      await storage.createPost({
        title: "미사강변고등학교 과학중점고 선정 안내",
        content: "우리 학교가 과학중점고등학교로 선정되었습니다. 앞으로 다양한 과학, 수학 심화 교육과정과 체험 활동이 진행될 예정입니다.",
        category: "home",
      });
      await storage.createPost({
        title: "물리/화학/생명과학/지구과학 실험실 소개",
        content: "최신식 기자재를 갖춘 4개의 전용 과학 실험실과 리소스룸을 운영하고 있습니다. 학생들의 자유로운 탐구 활동을 지원합니다.",
        category: "lab_intro",
      });
      await storage.createPost({
        title: "2024학년도 과학중점반 탐구 프로젝트",
        content: "학생들이 주도적으로 연구 주제를 선정하고 1년간 탐구하는 장기 프로젝트 활동입니다.",
        category: "science_class",
      });
    }
  } catch (error) {
    console.error("Failed to seed database:", error);
  }

  return httpServer;
}
