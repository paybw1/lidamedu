/**
 * Footer Component
 *
 * A responsive footer that displays copyright information and legal links.
 * This component appears at the bottom of every page in the application and
 * provides essential legal information and copyright notice.
 *
 * Features:
 * - Responsive design that adapts to different screen sizes
 * - Dynamic copyright year that automatically updates
 * - Links to legal pages (Privacy Policy, Terms of Service)
 * - View transitions for smooth navigation to legal pages
 */
import { Link } from "react-router";

/**
 * Footer component for displaying copyright information and legal links
 * 
 * This component renders a responsive footer that adapts to different screen sizes.
 * On mobile, it displays the legal links above the copyright notice, while on desktop,
 * it displays them side by side with the copyright on the left and links on the right.
 * 
 * @returns A footer component with copyright information and legal links
 */
export default function Footer() {
  return (
    <footer className="text-muted-foreground mt-auto border-t py-6 text-xs leading-relaxed md:py-8 md:text-[13px]">
      <div className="mx-auto w-full max-w-screen-2xl space-y-3 px-5 md:px-10">
        {/* 약관·정책 링크 */}
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-medium *:hover:underline">
          <Link to="/about" viewTransition>
            소개
          </Link>
          <Link to="/legal/terms-of-service" viewTransition>
            이용약관
          </Link>
          <Link to="/legal/privacy-policy" viewTransition>
            개인정보처리방침
          </Link>
          <Link to="/location" viewTransition>
            찾아오시는 길
          </Link>
        </nav>

        {/* 사업자 정보 */}
        <div className="space-y-0.5">
          <p>리담지식재산교육원 주식회사 | 대표 : 전화연</p>
          <p>
            학원등록번호 : 제15318호 | 원격학원등록번호 : 제15319호 |
            출판사신고번호 : 제2026-000065호
          </p>
          <p>
            사업자등록번호 : 587-88-03609 | 통신판매업신고번호 :
            2026-서울서초-0888
          </p>
          <p>
            주소 : (06588) 서울특별시 서초구 서초대로 131 2층 | ☏ 02-594-8881 |
            개인정보관리책임자 : 조형남
          </p>
        </div>

        <p className="text-muted-foreground/80">
          Copyright (c) 리담지식재산교육원 주식회사 All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
