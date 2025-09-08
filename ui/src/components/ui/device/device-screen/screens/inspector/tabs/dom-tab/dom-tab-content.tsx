import { observer } from 'mobx-react-lite'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomScrollView } from '@vkontakte/vkui'
import { Icon16Chevron, Icon24ChevronDownSmall } from '@vkontakte/icons'

import styles from './dom-tab-content.module.css'

interface DOMNode {
  id: string
  type: 'element' | 'text' | 'comment'
  tagName?: string
  attributes?: Record<string, string>
  content?: string
  children?: DOMNode[]
  level: number
}

interface DOMTabContentProps {
  htmlContent: string
}

const parseHTML = (html: string): DOMNode[] => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const parseNode = (node: Node, level = 0, index = 0): DOMNode | null => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const attributes: Record<string, string> = {}
      const tagName = element.tagName.toLowerCase()

      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i]
        attributes[attr.name] = attr.value
      }

      const children: DOMNode[] = []

      for (let i = 0; i < element.childNodes.length; i++) {
        const child = parseNode(element.childNodes[i], level + 1, i)

        if (child) children.push(child)
      }

      return {
        id: `${level}-${index}-${tagName}`,
        type: 'element',
        tagName,
        attributes,
        children,
        level,
      }
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const content = node.textContent?.trim()

      if (content) {
        return {
          id: String(Math.random() * 100),
          type: 'text',
          content,
          level,
        }
      }
    } else if (node.nodeType === Node.COMMENT_NODE) {
      return {
        id: String(Math.random() * 100),
        type: 'comment',
        content: node.textContent || '',
        level,
      }
    }

    return null
  }

  const nodes: DOMNode[] = []

  if (doc.documentElement) {
    const rootNode = parseNode(doc.documentElement)

    if (rootNode) nodes.push(rootNode)
  }

  return nodes
}

const DOMNodeComponent = observer(({ node }: { node: DOMNode }) => {
  const [isCollapsed, setCollapsed] = useState(false)
  const hasChildren = node.children && node.children.length > 0
  const indent = node.level * 16

  if (node.type === 'text') {
    return (
      <div className={styles.textNode} style={{ paddingLeft: indent }}>
        <span className={styles.textContent}>{`"${node.content}"`}</span>
      </div>
    )
  }

  if (node.type === 'comment') {
    return (
      <div className={styles.commentNode} style={{ paddingLeft: indent }}>
        <span className={styles.commentContent}>
          {'<!--'}
          {node.content}
          {'-->'}
        </span>
      </div>
    )
  }

  return (
    <div className={styles.elementNode}>
      <div
        className={styles.elementHeader}
        role={hasChildren ? 'button' : undefined}
        style={{ paddingLeft: indent }}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={() => hasChildren && setCollapsed(!isCollapsed)}
      >
        {hasChildren && (
          <span className={styles.toggleIcon}>{isCollapsed ? <Icon16Chevron /> : <Icon24ChevronDownSmall />}</span>
        )}
        <span className={styles.tagName}>
          {'<'}
          {node.tagName}
        </span>
        {node.attributes &&
          Object.entries(node.attributes).map(([key, value]) => (
            <span key={key} className={styles.attribute}>
              <span className={styles.attributeName}>{key}</span>
              <span className={styles.attributeEquals}>{'='}</span>
              <span className={styles.attributeValue}>{`"${value}"`}</span>
            </span>
          ))}
        <span className={styles.tagName}>{isCollapsed ? ' />' : '>'}</span>
      </div>

      {hasChildren && !isCollapsed && (
        <div className={styles.children}>
          {node.children?.map((child) => <DOMNodeComponent key={child.id} node={child} />)}
        </div>
      )}

      {hasChildren && !isCollapsed && (
        <div className={styles.closingTag} style={{ paddingLeft: indent }}>
          <span className={styles.tagName}>
            {'</'}
            {node.tagName}
            {'>'}
          </span>
        </div>
      )}
    </div>
  )
})

export const DOMTabContent = observer<DOMTabContentProps>(({ htmlContent }) => {
  const { t } = useTranslation()
  const parsedNodes = useMemo(() => {
    if (!htmlContent) return []

    return parseHTML(htmlContent)
  }, [htmlContent])

  if (!htmlContent) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyText}>{t('No HTML content available')}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <CustomScrollView className={styles.domTree}>
        {parsedNodes.map((node) => (
          <DOMNodeComponent key={node.id} node={node} />
        ))}
      </CustomScrollView>
    </div>
  )
})
