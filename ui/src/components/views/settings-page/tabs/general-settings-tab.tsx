import { FormItem, FormLayoutGroup } from '@vkontakte/vkui'

import { LangSwitcher } from '@/components/ui/lang-switcher'

export const GeneralSettingsTab = () => (
  <FormLayoutGroup>
    <FormItem>
      <LangSwitcher />
    </FormItem>
  </FormLayoutGroup>
)
