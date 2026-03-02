import { LogoFull, LogoMono } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Sun, Moon, Menu, X, ArrowRight } from "lucide-react";

function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [threshold]);
  return scrolled;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function PublicHeader() {
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-background/60 backdrop-blur-md border-b border-border/30"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" data-testid="link-logo">
            <LogoFull size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</Link>
            <Link href="/#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
          </nav>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login">
            <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Log In</span>
          </Link>
          <Link href="/signup">
            <Button className="gap-1.5 bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25 rounded-full px-5" data-testid="button-start-free">
              Start Free
            </Button>
          </Link>
        </div>
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Button size="icon" variant="ghost" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>
      <div className={`md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl ${mobileOpen ? "block" : "hidden"}`}>
        <div className="px-4 py-4 space-y-3">
          <Link href="/" className="block text-sm font-medium text-muted-foreground">Home</Link>
          <Link href="/docs" className="block text-sm font-medium text-muted-foreground">Docs</Link>
          <hr className="border-border/50" />
          <Link href="/login">
            <span className="block text-sm font-medium text-muted-foreground">Log In</span>
          </Link>
          <Link href="/signup">
            <Button className="w-full gap-1.5 bg-indigo-600 border-indigo-700 text-white rounded-full">Start Free</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="bg-neutral-900 text-neutral-400 py-16 border-t border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <LogoMono size={24} className="text-neutral-400" />
            <p className="mt-4 text-sm text-neutral-500 leading-relaxed max-w-xs">
              The AI spend control plane for teams and organizations.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">Product</p>
            <ul className="space-y-2.5">
              <li><Link href="/#how-it-works" className="text-sm hover:text-white transition-colors">How It Works</Link></li>
              <li><Link href="/#pricing" className="text-sm hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/docs" className="text-sm hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="/signup" className="text-sm hover:text-white transition-colors">Get Started</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">Company</p>
            <ul className="space-y-2.5">
              <li><Link href="/about" className="text-sm hover:text-white transition-colors">About</Link></li>
              <li><Link href="/careers" className="text-sm hover:text-white transition-colors">Careers</Link></li>
              <li><Link href="/contact" className="text-sm hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">Legal</p>
            <ul className="space-y-2.5">
              <li><Link href="/privacy" className="text-sm hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-sm hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/security" className="text-sm hover:text-white transition-colors">Security</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-neutral-800 text-center">
          <p className="text-sm text-neutral-500">&copy; 2026 Allotly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="pt-16">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
