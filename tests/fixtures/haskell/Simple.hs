module Simple (add, greet) where

import Data.Maybe (fromMaybe)

add :: Int -> Int -> Int
add x y = x + y

greet :: String -> String
greet name = "hi " ++ name
