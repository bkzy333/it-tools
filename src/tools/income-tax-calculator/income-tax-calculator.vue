<script setup lang="ts">
/**
 * 个人所得税计算器（综合所得年度汇算）。
 *
 * 算的是最常见的场景：居民个人工资薪金所得，按年度汇算清缴口径计税。
 * 公式：应纳税所得额 = 年度收入 - 60000（基本减除费用）- 专项扣除（三险一金）
 *       - 专项附加扣除 - 依法确定的其他扣除
 *       应纳税额 = 应纳税所得额 × 适用税率 - 速算扣除数
 *
 * 两个刻意的设计决定：
 * 1. 年终奖单独计税 vs 并入综合所得，两种都算出来让用户对比。政策延续到 2027 年底，
 *    而"哪种更划算"每年因人而异，只给一个结果等于替用户做决定。
 * 2. 住房贷款利息和住房租金在税法上是互斥的，所以做成一个下拉而不是两个开关，
 *    从输入层面就杜绝同时扣除。
 *
 * 免责声明写在页面底部：这是按现行全国性规则做的估算，各地社保比例、地方政策有差异。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// ------------------------------------------------------------------ 输入

const monthlySalary = ref(15000);
const annualBonus = ref(0);

/** 社保（含公积金）缴费基数，默认等于月薪，很多公司按下限缴，所以必须能改 */
const socialBase = ref(15000);
/** 住房公积金个人缴存比例，5%~12% */
const housingFundRate = ref(12);

/** 三岁以下婴幼儿照护：2000 元/月/每个婴幼儿 */
const infantCount = ref(0);
/** 子女教育：2000 元/月/每个子女 */
const childCount = ref(0);
/** 继续教育（学历）：400 元/月 */
const continuingEducation = ref(false);
/** 赡养老人：独生子女 3000 元/月，非独生子女分摊每人不超过 1500 元/月 */
const elderlySupport = ref<'none' | 'only-child' | 'shared'>('none');
/** 住房相关扣除，房贷利息和租金互斥 */
const housingDeduction = ref<'none' | 'loan' | 'rent-high' | 'rent-mid' | 'rent-low'>('none');
/** 大病医疗：个人负担超 15000 元的部分，年度限额 80000 元 */
const medicalExpense = ref(0);

// ------------------------------------------------------------------ 示例

const exampleData = {
  monthlySalary: 18000,
  annualBonus: 60000,
  socialBase: 18000,
  housingFundRate: 12,
  infantCount: 1,
  childCount: 1,
  continuingEducation: false,
  elderlySupport: 'only-child' as const,
  housingDeduction: 'loan' as const,
  medicalExpense: 0,
};

/**
 * 示例给的是"上有老下有小 + 房贷 + 年终奖"这个最典型的组合。
 * 用这种配置才看得出专项附加扣除到底能抵掉多少税，纯单身无扣除的例子
 * 算出来跟税率表没区别，用户学不到东西。
 */
function loadExample() {
  monthlySalary.value = exampleData.monthlySalary;
  annualBonus.value = exampleData.annualBonus;
  socialBase.value = exampleData.socialBase;
  housingFundRate.value = exampleData.housingFundRate;
  infantCount.value = exampleData.infantCount;
  childCount.value = exampleData.childCount;
  continuingEducation.value = exampleData.continuingEducation;
  elderlySupport.value = exampleData.elderlySupport;
  housingDeduction.value = exampleData.housingDeduction;
  medicalExpense.value = exampleData.medicalExpense;
}

// ------------------------------------------------------------------ 税率表

/** 综合所得年度税率表（超额累进）：上限、税率、速算扣除数 */
const YEARLY_BRACKETS = [
  { upTo: 36000, rate: 0.03, quickDeduction: 0 },
  { upTo: 144000, rate: 0.1, quickDeduction: 2520 },
  { upTo: 300000, rate: 0.2, quickDeduction: 16920 },
  { upTo: 420000, rate: 0.25, quickDeduction: 31920 },
  { upTo: 660000, rate: 0.3, quickDeduction: 52920 },
  { upTo: 960000, rate: 0.35, quickDeduction: 85920 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 181920 },
];

/** 按月换算后的税率表，年终奖单独计税时用这一套 */
const MONTHLY_BRACKETS = [
  { upTo: 3000, rate: 0.03, quickDeduction: 0 },
  { upTo: 12000, rate: 0.1, quickDeduction: 210 },
  { upTo: 25000, rate: 0.2, quickDeduction: 1410 },
  { upTo: 35000, rate: 0.25, quickDeduction: 2660 },
  { upTo: 55000, rate: 0.3, quickDeduction: 4410 },
  { upTo: 80000, rate: 0.35, quickDeduction: 7160 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, quickDeduction: 15160 },
];

function lookupBracket(taxable: number, brackets: typeof YEARLY_BRACKETS) {
  return brackets.find((bracket) => taxable <= bracket.upTo) ?? brackets[brackets.length - 1];
}

function taxOf(taxable: number, brackets: typeof YEARLY_BRACKETS) {
  if (taxable <= 0) {
    return { tax: 0, rate: 0, quickDeduction: 0 };
  }
  const bracket = lookupBracket(taxable, brackets);
  return { tax: taxable * bracket.rate - bracket.quickDeduction, rate: bracket.rate, quickDeduction: bracket.quickDeduction };
}

// ------------------------------------------------------------------ 计算

const housingMonthlyAmount = computed(() => {
  switch (housingDeduction.value) {
    case 'loan':
      return 1000;
    case 'rent-high':
      return 1500;
    case 'rent-mid':
      return 1100;
    case 'rent-low':
      return 800;
    default:
      return 0;
  }
});

const elderlyMonthlyAmount = computed(() => {
  if (elderlySupport.value === 'only-child') {
    return 3000;
  }
  if (elderlySupport.value === 'shared') {
    return 1500;
  }
  return 0;
});

/** 三险一金个人缴纳：养老 8% + 医疗 2% + 失业 0.5%，再加公积金 */
const socialInsuranceMonthly = computed(() => socialBase.value * 0.105 + (socialBase.value * housingFundRate.value) / 100);

/** 大病医疗：超 15000 的部分才能扣，且年度封顶 80000 */
const medicalDeductionAnnual = computed(() => Math.min(Math.max(medicalExpense.value - 15000, 0), 80000));

const additionalMonthly = computed(
  () =>
    infantCount.value * 2000 +
    childCount.value * 2000 +
    (continuingEducation.value ? 400 : 0) +
    housingMonthlyAmount.value +
    elderlyMonthlyAmount.value,
);

const additionalAnnual = computed(() => additionalMonthly.value * 12 + medicalDeductionAnnual.value);

const annualIncome = computed(() => monthlySalary.value * 12);
const socialAnnual = computed(() => socialInsuranceMonthly.value * 12);

/** 不含年终奖的应纳税所得额 */
const taxableIncome = computed(() =>
  Math.max(annualIncome.value - 60000 - socialAnnual.value - additionalAnnual.value, 0),
);

const salaryTax = computed(() => taxOf(taxableIncome.value, YEARLY_BRACKETS));

/** 年终奖单独计税：把奖金除以 12 查月度税率表，再对全额计税 */
const bonusSeparateTax = computed(() => {
  if (annualBonus.value <= 0) {
    return 0;
  }
  const monthly = annualBonus.value / 12;
  const bracket = lookupBracket(monthly, MONTHLY_BRACKETS);
  return annualBonus.value * bracket.rate - bracket.quickDeduction;
});

/** 年终奖并入综合所得：整体应纳税额减去不含奖金时的应纳税额，才是奖金带来的税 */
const bonusCombinedTax = computed(() => {
  if (annualBonus.value <= 0) {
    return 0;
  }
  const combined = taxOf(taxableIncome.value + annualBonus.value, YEARLY_BRACKETS);
  return combined.tax - salaryTax.value.tax;
});

const bonusAdvantage = computed(() => {
  if (annualBonus.value <= 0) {
    return null;
  }
  const diff = bonusCombinedTax.value - bonusSeparateTax.value;
  return {
    /** 负数说明单独计税更省 */
    diff,
    better: diff > 0 ? 'separate' : diff < 0 ? 'combined' : 'same',
    saving: Math.abs(diff),
  };
});

const totalSalaryTax = computed(() => salaryTax.value.tax + bonusSeparateTax.value);

const netAnnualIncome = computed(() => annualIncome.value + annualBonus.value - socialAnnual.value - totalSalaryTax.value);

const monthlyNet = computed(() => netAnnualIncome.value / 12);

const yuan = (value: number) => value.toFixed(2);
const percent = (rate: number) => `${(rate * 100).toFixed(0)}%`;
</script>

<template>
  <div class="tax-calculator">
    <div flex justify-end mb-2>
      <ToolExampleButton @click="loadExample" />
    </div>

    <c-card :title="t('tools.income-tax-calculator.texts.title-income')" mb-3>
      <n-space>
        <n-form-item :label="t('tools.income-tax-calculator.texts.label-monthly-salary')" label-placement="left">
          <n-input-number-i18n v-model:value="monthlySalary" :min="0" :step="1000" />
        </n-form-item>
        <n-form-item :label="t('tools.income-tax-calculator.texts.label-annual-bonus')" label-placement="left">
          <n-input-number-i18n v-model:value="annualBonus" :min="0" :step="1000" />
        </n-form-item>
      </n-space>
    </c-card>

    <c-card :title="t('tools.income-tax-calculator.texts.title-social')" mb-3>
      <n-space>
        <n-form-item :label="t('tools.income-tax-calculator.texts.label-social-base')" label-placement="left">
          <n-input-number-i18n v-model:value="socialBase" :min="0" :step="1000" />
        </n-form-item>
        <n-form-item :label="t('tools.income-tax-calculator.texts.label-housing-fund-rate')" label-placement="left">
          <n-input-number-i18n v-model:value="housingFundRate" :min="0" :max="12" :step="1" />
        </n-form-item>
      </n-space>
      <div class="hint">
        {{ t('tools.income-tax-calculator.texts.hint-social-formula') }} {{ yuan(socialInsuranceMonthly) }}
        {{ t('tools.income-tax-calculator.texts.unit-per-month') }}
      </div>
    </c-card>

    <c-card :title="t('tools.income-tax-calculator.texts.title-additional')" mb-3>
      <n-space mb-2>
        <n-form-item :label="t('tools.income-tax-calculator.texts.label-infants')" label-placement="left">
          <n-input-number-i18n v-model:value="infantCount" :min="0" :max="10" :step="1" />
        </n-form-item>
        <n-form-item :label="t('tools.income-tax-calculator.texts.label-children')" label-placement="left">
          <n-input-number-i18n v-model:value="childCount" :min="0" :max="10" :step="1" />
        </n-form-item>
      </n-space>

      <n-space mb-2>
        <c-select
          v-model:value="housingDeduction"
          :label="t('tools.income-tax-calculator.texts.label-housing')"
          label-position="left"
          :options="[
            { label: t('tools.income-tax-calculator.texts.option-housing-none'), value: 'none' },
            { label: t('tools.income-tax-calculator.texts.option-housing-loan'), value: 'loan' },
            { label: t('tools.income-tax-calculator.texts.option-housing-rent-high'), value: 'rent-high' },
            { label: t('tools.income-tax-calculator.texts.option-housing-rent-mid'), value: 'rent-mid' },
            { label: t('tools.income-tax-calculator.texts.option-housing-rent-low'), value: 'rent-low' },
          ]"
        />
        <c-select
          v-model:value="elderlySupport"
          :label="t('tools.income-tax-calculator.texts.label-elderly')"
          label-position="left"
          :options="[
            { label: t('tools.income-tax-calculator.texts.option-elderly-none'), value: 'none' },
            { label: t('tools.income-tax-calculator.texts.option-elderly-only'), value: 'only-child' },
            { label: t('tools.income-tax-calculator.texts.option-elderly-shared'), value: 'shared' },
          ]"
        />
      </n-space>

      <n-form-item :label="t('tools.income-tax-calculator.texts.label-education')" label-placement="left">
        <n-switch v-model:value="continuingEducation" />
      </n-form-item>

      <n-form-item :label="t('tools.income-tax-calculator.texts.label-medical')" label-placement="left">
        <n-input-number-i18n v-model:value="medicalExpense" :min="0" :step="1000" />
      </n-form-item>

      <div class="hint">
        {{ t('tools.income-tax-calculator.texts.hint-additional-total') }} {{ yuan(additionalMonthly) }}
        {{ t('tools.income-tax-calculator.texts.unit-per-month') }}
      </div>
    </c-card>

    <c-card :title="t('tools.income-tax-calculator.texts.title-result')">
      <input-copyable
        :label="t('tools.income-tax-calculator.texts.label-taxable-income')"
        label-position="left"
        label-width="180px"
        :value="yuan(taxableIncome)"
        mb-1
      />
      <input-copyable
        :label="t('tools.income-tax-calculator.texts.label-tax-rate')"
        label-position="left"
        label-width="180px"
        :value="`${percent(salaryTax.rate)} / ${t('tools.income-tax-calculator.texts.label-quick-deduction')} ${yuan(salaryTax.quickDeduction)}`"
        mb-1
      />
      <input-copyable
        :label="t('tools.income-tax-calculator.texts.label-salary-tax')"
        label-position="left"
        label-width="180px"
        :value="yuan(salaryTax.tax)"
        mb-1
      />

      <template v-if="annualBonus > 0">
        <div class="divider" />
        <div class="compare-title">{{ t('tools.income-tax-calculator.texts.title-bonus-compare') }}</div>
        <input-copyable
          :label="t('tools.income-tax-calculator.texts.label-bonus-separate')"
          label-position="left"
          label-width="180px"
          :value="yuan(bonusSeparateTax)"
          mb-1
        />
        <input-copyable
          :label="t('tools.income-tax-calculator.texts.label-bonus-combined')"
          label-position="left"
          label-width="180px"
          :value="yuan(bonusCombinedTax)"
          mb-1
        />
        <div v-if="bonusAdvantage && bonusAdvantage.better !== 'same'" class="compare-hint">
          {{
            bonusAdvantage.better === 'separate'
              ? t('tools.income-tax-calculator.texts.hint-better-separate', [yuan(bonusAdvantage.saving)])
              : t('tools.income-tax-calculator.texts.hint-better-combined', [yuan(bonusAdvantage.saving)])
          }}
        </div>
      </template>

      <div class="divider" />
      <input-copyable
        :label="t('tools.income-tax-calculator.texts.label-total-tax')"
        label-position="left"
        label-width="180px"
        :value="yuan(totalSalaryTax)"
        mb-1
      />
      <input-copyable
        :label="t('tools.income-tax-calculator.texts.label-net-annual')"
        label-position="left"
        label-width="180px"
        :value="yuan(netAnnualIncome)"
        mb-1
      />
      <input-copyable
        :label="t('tools.income-tax-calculator.texts.label-monthly-net')"
        label-position="left"
        label-width="180px"
        :value="yuan(monthlyNet)"
      />

      <div class="disclaimer">{{ t('tools.income-tax-calculator.texts.disclaimer') }}</div>
    </c-card>
  </div>
</template>

<style lang="less" scoped>
.tax-calculator {
  max-width: 900px;
  width: 100%;
}

.hint {
  font-size: 13px;
  opacity: 0.65;
}

.divider {
  height: 1px;
  background-color: rgba(128, 128, 128, 0.2);
  margin: 14px 0;
}

.compare-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.compare-hint {
  font-size: 13px;
  opacity: 0.8;
  margin-top: 6px;
}

.disclaimer {
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.55;
}
</style>
