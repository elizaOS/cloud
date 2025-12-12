import { generateStaticParamsFor, importPage } from 'nextra/pages'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props: PageProps) {
  const params = await props.params
  // Handle root path - mdxPath will be undefined or empty for /docs
  const path = params.mdxPath ?? []
  const { metadata } = await importPage(path)
  return metadata
}

type PageProps = {
  params: Promise<{
    mdxPath?: string[]
  }>
}

export default async function Page(props: PageProps) {
  const params = await props.params
  // Handle root path - mdxPath will be undefined or empty for /docs
  const path = params.mdxPath ?? []
  const result = await importPage(path)
  const { default: MDXContent } = result
  
  return <MDXContent {...props} params={params} />
}
