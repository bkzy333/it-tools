<script lang="ts" setup>
import Home2 from '~icons/tabler/home-2';
import Menu2 from '~icons/tabler/menu-2';
import { NIcon, useThemeVars } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';
import HeroGradient from '../assets/hero-gradient.svg?component';
import MenuLayout from '../components/MenuLayout.vue';
import NavbarButtons from '../components/NavbarButtons.vue';
import CollapsibleToolMenu from '@/components/CollapsibleToolMenu.vue';
import { useStyleStore } from '@/stores/style.store';
import { useToolStore } from '@/tools/tools.store';
import type { ToolCategory } from '@/tools/tools.types';

const themeVars = useThemeVars();
const styleStore = useStyleStore();

// Expose the navbar height so the mobile menu (MenuLayout.vue) can position
// itself right under the always-visible top bar.
const navbarRef = ref<HTMLElement | null>(null);
const { height: navbarHeight } = useElementSize(navbarRef, undefined, { box: 'border-box' });
watchEffect(() => {
  document.documentElement.style.setProperty('--app-topbar-height', `${Math.round(navbarHeight.value)}px`);
});

const { t, locale } = useI18n();

const toolStore = useToolStore();
const { favoriteTools, toolsByCategory } = storeToRefs(toolStore);

const tools = computed<ToolCategory[]>(() => [
  ...(favoriteTools.value.length > 0
    ? [{ name: t('tools.categories.favorite-tools'), components: favoriteTools.value }]
    : []),
  ...toolsByCategory.value,
]);
</script>

<template>
  <MenuLayout class="menu-layout" :class="{ isSmallScreen: styleStore.isSmallScreen }">
    <template #sider>
      <RouterLink to="/" class="hero-wrapper">
        <HeroGradient class="gradient" />
        <div class="text-wrapper">
          <div class="title">在线工具箱</div>
          <div class="divider" />
          <div class="subtitle">
            {{ $t('home.subtitle') }}
          </div>
        </div>
      </RouterLink>

      <div class="sider-content">
        <div v-if="styleStore.isSmallScreen" mb-24px flex justify-center>
          <NavbarButtons />
        </div>

        <CollapsibleToolMenu :tools-by-category="tools" />

        <!-- 站点自身页面入口（AdSense 审核要求这几页能一键找到，不能藏在页脚深处） -->
        <div class="site-links">
          <RouterLink to="/about">关于本站</RouterLink>
          <span mx-1 op-50>·</span>
          <RouterLink to="/privacy">隐私政策</RouterLink>
          <span mx-1 op-50>·</span>
          <RouterLink to="/contact">联系我们</RouterLink>
          <span mx-1 op-50>·</span>
          <RouterLink to="/terms">使用条款</RouterLink>
          <span mx-1 op-50>·</span>
          <RouterLink to="/cookies">Cookie</RouterLink>
          <span mx-1 op-50>·</span>
          <RouterLink to="/open-source">开源声明</RouterLink>
        </div>
      </div>
    </template>

    <template #content>
      <div ref="navbarRef" class="navbar" flex items-center justify-center gap-2>
        <c-button
          circle
          variant="text"
          :aria-label="$t('home.toggleMenu')"
          @click="styleStore.isMenuCollapsed = !styleStore.isMenuCollapsed"
        >
          <NIcon size="25" :component="Menu2" />
        </c-button>

        <c-tooltip :tooltip="$t('home.home')" position="bottom">
          <c-button to="/" circle variant="text" :aria-label="$t('home.home')">
            <NIcon size="25" :component="Home2" />
          </c-button>
        </c-tooltip>

        <Suspense>
          <command-palette :key="locale" />
        </Suspense>

        <div>
          <NavbarButtons v-if="!styleStore.isSmallScreen" />
        </div>

      </div>
      <!-- 谷歌广告位：顶部横幅（接入前 ADS_ENABLED=false，不渲染任何内容） -->
      <ads-placeholder variant="top" />
      <!-- Positioned wrapper so the route-change loading overlay (see router.ts)
           can cover just the page, leaving the nav bar and menu visible. -->
      <div class="page-content">
        <slot />
      </div>
    </template>
  </MenuLayout>
</template>

<style lang="less" scoped>
// ::v-deep(.n-layout-scroll-container) {
//     @percent: 4%;
//     @position: 25px;
//     @size: 50px;
//     @color: #eeeeee25;
//     background-image: radial-gradient(@color @percent, transparent @percent),
//         radial-gradient(@color @percent, transparent @percent);
//     background-position: 0 0, @position @position;
//     background-size: @size @size;
// }

.site-links {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: #838587;

  a {
    color: inherit;
    text-decoration: none;

    &:hover {
      color: v-bind('themeVars.primaryColor');
    }
  }
}

.sider-content {
  padding-top: 20px;
  padding-bottom: 50px;

  @media (max-width: 700px) {
    // The hero block above provides the symmetric 24px gap
    padding-top: 0;
  }
}

.page-content {
  position: relative;
}

// Mobile: the top bar stays visible while scrolling, and the full-width menu
// (see MenuLayout.vue) opens right under it.
.navbar {
  @media (max-width: 700px) {
    position: sticky;
    top: 0;
    z-index: 20;
    // Bleed over the scroll container's 13px padding so content scrolls
    // under an opaque, full-width bar.
    margin: -13px -13px 13px;
    padding: 13px;
    background-color: v-bind('themeVars.bodyColor');
  }
}

.hero-wrapper {
  position: sticky;
  display: flex;
  top: 0;
  left: 0;
  z-index: 10;
  height: 125px;
  overflow: hidden;
  width: inherit;

  .gradient {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .text-wrapper {
    position: absolute;
    left: 0;
    width: 100%;
    text-align: center;
    top: 16px;
    color: #fff;

    .title {
      font-size: 22px;
      font-weight: 600;
    }

    .divider {
      width: 50px;
      height: 2px;
      border-radius: 4px;
      background-color: v-bind('themeVars.primaryColor');
      margin: 0 auto 5px;
    }

    .subtitle {
      font-size: 16px;
    }
  }

  // Mobile: seamless full-width menu — no green hero gradient, text follows
  // the theme, and the header scrolls with the menu. Placed after the base
  // rules above so these override them (same specificity, later source order).
  @media (max-width: 700px) {
    position: static;
    height: auto;
    // Symmetric spacing above and below the title block (sider-content's
    // top padding is removed on mobile to keep the bottom gap equal)
    padding: 24px 0;
    // The hero is a router link; keep the plain-text look without the gradient
    text-decoration: none;

    .gradient {
      display: none;
    }

    .text-wrapper {
      position: static;
      padding-top: 0;
      color: v-bind('themeVars.textColor1');
    }
  }
}
</style>
